/**
 * VibeComposer Video Generator
 *
 * Complete pipeline for generating beat-synced music videos
 * from songs created in Ableton Live.
 *
 * Pipeline:
 * 1. Analyze audio → extract beats, sections, transitions, energy
 * 2. Plan video → generate prompts per section, map styles
 * 3. Generate clips → call video generation APIs (Seedance, Runway, Kling)
 * 4. Beat-sync → align cuts and effects to musical beats
 * 5. Assemble → concatenate clips with transitions and audio overlay
 */

// Types
export type {
  SongAnalysis,
  SongSection,
  SectionType,
  Beat,
  Transition,
  TransitionType,
  SpectralProfile,
  VideoProvider,
  VisualStyle,
  VideoSegment,
  VideoSegmentStatus,
  VideoTransition,
  VideoProject,
  ProjectStatus,
  VideoProviderConfig,
  GenerateClipRequest,
  GenerateClipResponse,
  PromptContext,
} from './types.js';

export {
  SECTION_VISUAL_DEFAULTS,
  TRANSITION_VIDEO_MAP,
} from './types.js';

// Audio Analysis
export {
  analyzeAudio,
  analyzeAudioBuffer,
  analyzeFromSessionData,
} from './analyzer/audioAnalyzer.js';

// Prompt Engine
export {
  buildSectionStyle,
  generateSectionPrompt,
  planVideoSegments,
} from './generator/promptEngine.js';

// Video Providers
export {
  createProvider,
  pollUntilComplete,
} from './generator/videoProvider.js';
export type { IVideoProvider } from './generator/videoProvider.js';

// Beat Sync
export {
  createBeatSyncPlan,
  snapToNearestBeat,
  snapToNearestDownbeat,
  generateBeatSyncFilters,
  getFFmpegTransition,
} from './sync/beatSyncEngine.js';
export type { BeatSyncPlan, EffectTrigger } from './sync/beatSyncEngine.js';

// Video Assembly
export {
  assembleVideo,
  createConcatFile,
} from './assembler/videoAssembler.js';
export type { AssemblyOptions, AssemblyResult } from './assembler/videoAssembler.js';

// ── Orchestrator ────────────────────────────────────────────────────

import type { SongAnalysis, VideoProject, VideoSegment, VideoProviderConfig } from './types.js';
import { analyzeAudio, analyzeFromSessionData } from './analyzer/audioAnalyzer.js';
import { planVideoSegments } from './generator/promptEngine.js';
import { createProvider, pollUntilComplete } from './generator/videoProvider.js';
import { createBeatSyncPlan } from './sync/beatSyncEngine.js';
import { assembleVideo } from './assembler/videoAssembler.js';

export interface OrchestratorOptions {
  /** Audio file path for analysis */
  audioPath: string;
  /** Video provider config */
  providerConfig: VideoProviderConfig;
  /** Narrative theme for the video */
  narrativeTheme: string;
  /** Genre (for style presets) */
  genre?: string;
  /** Output path for final video */
  outputPath: string;
  /** Resolution */
  resolution?: '480p' | '720p' | '1080p';
  /** Aspect ratio */
  aspectRatio?: '16:9' | '9:16' | '4:3' | '1:1';
  /** Progress callback */
  onProgress?: (stage: string, progress: number, detail?: string) => void;
}

/**
 * Run the full music video generation pipeline.
 * This is the main entry point for end-to-end video creation.
 */
export async function generateMusicVideo(options: OrchestratorOptions): Promise<VideoProject> {
  const {
    audioPath,
    providerConfig,
    narrativeTheme,
    genre,
    outputPath,
    resolution = '720p',
    aspectRatio = '16:9',
    onProgress,
  } = options;

  const projectId = `proj-${Date.now()}`;

  // Stage 1: Analyze audio
  onProgress?.('analyzing', 0, 'Analyzing audio structure...');
  const analysis = await analyzeAudio(audioPath);
  onProgress?.('analyzing', 1, `Found ${analysis.sections.length} sections, ${analysis.beats.length} beats`);

  // Stage 2: Plan video segments with prompts
  onProgress?.('prompting', 0, 'Generating visual prompts...');
  const segments = planVideoSegments(analysis, narrativeTheme, genre);
  onProgress?.('prompting', 1, `Planned ${segments.length} video segments`);

  // Stage 3: Generate video clips
  onProgress?.('generating', 0, `Generating ${segments.length} clips...`);
  const provider = await createProvider(providerConfig);

  const generatedSegments = await generateAllClips(
    segments,
    provider,
    resolution,
    aspectRatio,
    (completed, total) => {
      onProgress?.('generating', completed / total, `Clip ${completed}/${total}`);
    },
  );

  // Stage 4: Beat-sync alignment
  onProgress?.('assembling', 0, 'Aligning to beat grid...');
  const syncPlan = createBeatSyncPlan(analysis, generatedSegments);

  // Stage 5: Assemble final video
  onProgress?.('assembling', 0.5, 'Assembling final video...');
  const resolutionMap = {
    '480p': { width: 854, height: 480 },
    '720p': { width: 1280, height: 720 },
    '1080p': { width: 1920, height: 1080 },
  };

  const result = await assembleVideo(generatedSegments, syncPlan, {
    audioPath,
    outputPath,
    resolution: resolutionMap[resolution],
    fps: 24,
    beatSyncEffects: true,
  });

  onProgress?.('completed', 1, `Video assembled: ${result.outputPath}`);

  return {
    id: projectId,
    analysis,
    segments: generatedSegments,
    narrativeTheme,
    provider: providerConfig.provider,
    apiKey: providerConfig.apiKey,
    resolution,
    aspectRatio,
    status: 'completed',
    outputUrl: result.outputPath,
  };
}

async function generateAllClips(
  segments: VideoSegment[],
  provider: import('./generator/videoProvider.js').IVideoProvider,
  resolution: string,
  aspectRatio: string,
  onClipComplete?: (completed: number, total: number) => void,
): Promise<VideoSegment[]> {
  const results: VideoSegment[] = [];
  const maxConcurrent = 3;

  // Process in batches to avoid rate limits
  for (let i = 0; i < segments.length; i += maxConcurrent) {
    const batch = segments.slice(i, i + maxConcurrent);

    const batchResults = await Promise.allSettled(
      batch.map(async (segment) => {
        const updated = { ...segment, status: 'generating' as const };

        try {
          const job = await provider.generateClip({
            prompt: segment.prompt,
            duration: Math.min(segment.duration, provider.maxDuration()),
            resolution,
            aspectRatio,
          });

          const result = await pollUntilComplete(provider, job.id);

          if (result.status === 'completed' && result.clipUrl) {
            return { ...updated, status: 'completed' as const, clipUrl: result.clipUrl };
          } else {
            return { ...updated, status: 'failed' as const };
          }
        } catch {
          return { ...updated, status: 'failed' as const };
        }
      }),
    );

    for (const result of batchResults) {
      if (result.status === 'fulfilled') {
        results.push(result.value);
      } else {
        results.push({
          ...batch[batchResults.indexOf(result)],
          status: 'failed',
        });
      }
    }

    onClipComplete?.(results.length, segments.length);
  }

  return results;
}

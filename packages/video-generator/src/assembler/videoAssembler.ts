import { spawn } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { VideoSegment, VideoTransition } from '../types.js';
import type { BeatSyncPlan, EffectTrigger } from '../sync/beatSyncEngine.js';
import { generateBeatSyncFilters, getFFmpegTransition } from '../sync/beatSyncEngine.js';

export interface AssemblyOptions {
  /** Audio file to overlay */
  audioPath: string;
  /** Output file path */
  outputPath: string;
  /** Resolution (width x height) */
  resolution: { width: number; height: number };
  /** Frame rate */
  fps: number;
  /** Apply beat-synced effects */
  beatSyncEffects: boolean;
}

export interface AssemblyResult {
  outputPath: string;
  duration: number;
  segmentCount: number;
}

/**
 * Assemble generated video clips into a final music video.
 * Uses FFmpeg for clip concatenation, transitions, and audio overlay.
 */
export async function assembleVideo(
  segments: VideoSegment[],
  syncPlan: BeatSyncPlan,
  options: AssemblyOptions,
): Promise<AssemblyResult> {
  const completedSegments = segments.filter(s => s.status === 'completed' && s.clipUrl);

  if (completedSegments.length === 0) {
    throw new Error('No completed video segments to assemble');
  }

  const tempDir = await mkdtemp(join(tmpdir(), 'vibecomposer-assembly-'));

  // Strategy: use FFmpeg concat demuxer with xfade for transitions
  if (completedSegments.length === 1) {
    return assembleSingleClip(completedSegments[0], syncPlan, options, tempDir);
  }

  return assembleMultipleClips(completedSegments, syncPlan, options, tempDir);
}

async function assembleSingleClip(
  segment: VideoSegment,
  syncPlan: BeatSyncPlan,
  options: AssemblyOptions,
  tempDir: string,
): Promise<AssemblyResult> {
  const filterParts: string[] = [];

  // Scale to target resolution
  filterParts.push(
    `[0:v]scale=${options.resolution.width}:${options.resolution.height}:force_original_aspect_ratio=decrease,pad=${options.resolution.width}:${options.resolution.height}:(ow-iw)/2:(oh-ih)/2`,
  );

  // Add beat-sync effects
  if (options.beatSyncEffects && syncPlan.effectTriggers.length > 0) {
    const beatFilters = generateBeatSyncFilters(syncPlan.effectTriggers);
    if (beatFilters) {
      filterParts.push(beatFilters);
    }
  }

  filterParts.push('[outv]');

  const args = [
    '-i', segment.clipUrl!,
    '-i', options.audioPath,
    '-filter_complex', filterParts.join(','),
    '-map', '[outv]',
    '-map', '1:a',
    '-c:v', 'libx264',
    '-preset', 'medium',
    '-crf', '18',
    '-c:a', 'aac',
    '-b:a', '192k',
    '-shortest',
    '-y',
    options.outputPath,
  ];

  await runFFmpeg(args);

  return {
    outputPath: options.outputPath,
    duration: segment.duration,
    segmentCount: 1,
  };
}

async function assembleMultipleClips(
  segments: VideoSegment[],
  syncPlan: BeatSyncPlan,
  options: AssemblyOptions,
  tempDir: string,
): Promise<AssemblyResult> {
  // Build complex filter graph with xfade transitions between clips
  const inputArgs: string[] = [];
  const filterParts: string[] = [];

  // Add all clip inputs
  for (const segment of segments) {
    inputArgs.push('-i', segment.clipUrl!);
  }

  // Add audio input (last input)
  inputArgs.push('-i', options.audioPath);
  const audioIndex = segments.length;

  // Scale all inputs to same resolution
  for (let i = 0; i < segments.length; i++) {
    filterParts.push(
      `[${i}:v]scale=${options.resolution.width}:${options.resolution.height}:force_original_aspect_ratio=decrease,pad=${options.resolution.width}:${options.resolution.height}:(ow-iw)/2:(oh-ih)/2,fps=${options.fps}[v${i}]`,
    );
  }

  // Chain xfade transitions between consecutive clips
  let currentLabel = 'v0';
  let offset = segments[0].duration;

  for (let i = 1; i < segments.length; i++) {
    const outputLabel = i === segments.length - 1 ? 'vout' : `xf${i}`;
    const transition = segments[i - 1].outTransition;

    if (transition && transition.type !== 'cut' && transition.duration > 0) {
      const ffTransition = getFFmpegTransition(transition);
      const transOffset = Math.max(offset - ffTransition.duration, 0);

      filterParts.push(
        `[${currentLabel}][v${i}]xfade=transition=${ffTransition.name}:duration=${ffTransition.duration}:offset=${transOffset}[${outputLabel}]`,
      );

      offset = transOffset + segments[i].duration;
    } else {
      // Hard cut: just concatenate
      filterParts.push(
        `[${currentLabel}][v${i}]concat=n=2:v=1:a=0[${outputLabel}]`,
      );
      offset += segments[i].duration;
    }

    currentLabel = outputLabel;
  }

  // Apply beat-sync effects to the final composited video
  if (options.beatSyncEffects && syncPlan.effectTriggers.length > 0) {
    const beatFilters = generateBeatSyncFilters(syncPlan.effectTriggers);
    if (beatFilters) {
      filterParts.push(`[vout]${beatFilters}[vfinal]`);
      currentLabel = 'vfinal';
    } else {
      currentLabel = 'vout';
    }
  } else {
    currentLabel = 'vout';
  }

  const filterComplex = filterParts.join('; ');

  const args = [
    ...inputArgs,
    '-filter_complex', filterComplex,
    '-map', `[${currentLabel}]`,
    '-map', `${audioIndex}:a`,
    '-c:v', 'libx264',
    '-preset', 'medium',
    '-crf', '18',
    '-c:a', 'aac',
    '-b:a', '192k',
    '-shortest',
    '-movflags', '+faststart',
    '-y',
    options.outputPath,
  ];

  await runFFmpeg(args);

  const totalDuration = segments.reduce((sum, s) => sum + s.duration, 0);

  return {
    outputPath: options.outputPath,
    duration: totalDuration,
    segmentCount: segments.length,
  };
}

/**
 * Generate a concat demuxer file as an alternative to complex filter graphs.
 * Simpler but doesn't support transitions.
 */
export async function createConcatFile(
  segments: VideoSegment[],
  tempDir: string,
): Promise<string> {
  const lines = segments
    .filter(s => s.clipUrl)
    .map(s => `file '${s.clipUrl}'`)
    .join('\n');

  const concatPath = join(tempDir, 'concat.txt');
  await writeFile(concatPath, lines, 'utf-8');
  return concatPath;
}

/**
 * Run an FFmpeg command and return when complete.
 */
function runFFmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', args, { stdio: ['pipe', 'pipe', 'pipe'] });

    let stderr = '';
    proc.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`FFmpeg exited with code ${code}: ${stderr.slice(-500)}`));
      } else {
        resolve();
      }
    });

    proc.on('error', (err) => {
      reject(new Error(`Failed to run FFmpeg: ${err.message}. Make sure FFmpeg is installed.`));
    });
  });
}

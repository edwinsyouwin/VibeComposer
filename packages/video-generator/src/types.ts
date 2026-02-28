// ── Song Analysis Types ─────────────────────────────────────────────

export type SectionType =
  | 'intro'
  | 'verse'
  | 'chorus'
  | 'build'
  | 'drop'
  | 'breakdown'
  | 'bridge'
  | 'outro';

export interface Beat {
  /** Time in seconds */
  time: number;
  /** Beat number within the bar (1-indexed) */
  beatInBar: number;
  /** Whether this is a downbeat (beat 1) */
  isDownbeat: boolean;
  /** Detected energy level 0-1 */
  energy: number;
}

export interface SongSection {
  /** Section identifier */
  id: string;
  /** Section type (intro, drop, build, etc.) */
  type: SectionType;
  /** Start time in seconds */
  startTime: number;
  /** End time in seconds */
  endTime: number;
  /** Duration in seconds */
  duration: number;
  /** Start bar number */
  startBar: number;
  /** End bar number */
  endBar: number;
  /** Average energy level 0-1 */
  energy: number;
  /** Beats within this section */
  beats: Beat[];
  /** Detected key (if modulation occurs) */
  key?: string;
}

export interface Transition {
  /** Unique id */
  id: string;
  /** Section ending */
  fromSection: string;
  /** Section beginning */
  toSection: string;
  /** Transition start time (seconds) */
  time: number;
  /** Type of transition detected */
  type: TransitionType;
  /** Intensity of the transition 0-1 */
  intensity: number;
}

export type TransitionType =
  | 'cut'         // Hard cut (e.g. drop hit)
  | 'riser'       // Energy builds up
  | 'fade'        // Gradual energy decrease
  | 'filter'      // Filter sweep transition
  | 'silence'     // Moment of silence before impact
  | 'crossfade';  // Gradual blend

export interface SongAnalysis {
  /** File path or identifier of the analyzed audio */
  audioSource: string;
  /** Detected BPM */
  bpm: number;
  /** Detected key */
  key: string;
  /** Total duration in seconds */
  duration: number;
  /** Time signature (e.g. "4/4") */
  timeSignature: string;
  /** All detected beats */
  beats: Beat[];
  /** Song sections */
  sections: SongSection[];
  /** Transitions between sections */
  transitions: Transition[];
  /** Energy curve: array of [time, energy] pairs */
  energyCurve: [number, number][];
  /** Spectral features summary */
  spectralProfile: SpectralProfile;
}

export interface SpectralProfile {
  /** Dominant frequency bands per section */
  dominantBands: Record<string, 'sub' | 'low' | 'mid' | 'high' | 'presence'>;
  /** Overall brightness 0-1 */
  brightness: number;
  /** Overall warmth 0-1 */
  warmth: number;
}

// ── Video Generation Types ──────────────────────────────────────────

export type VideoProvider = 'seedance' | 'runway' | 'kling' | 'pika';

export interface VisualStyle {
  /** Display name */
  name: string;
  /** Core visual aesthetic */
  aesthetic: string;
  /** Color palette description */
  colorPalette: string;
  /** Camera movement style */
  cameraStyle: string;
  /** Motion intensity (0-1, synced to section energy) */
  motionIntensity: number;
  /** Additional style keywords */
  keywords: string[];
}

export interface VideoSegment {
  /** Unique id */
  id: string;
  /** Which song section this maps to */
  sectionId: string;
  /** Start time in the final video (seconds) */
  startTime: number;
  /** Duration (seconds) */
  duration: number;
  /** The prompt used for generation */
  prompt: string;
  /** Visual style applied */
  style: VisualStyle;
  /** Reference image URL (for image-to-video) */
  referenceImage?: string;
  /** Generation status */
  status: VideoSegmentStatus;
  /** URL of generated clip */
  clipUrl?: string;
  /** Transition to apply at the END of this segment */
  outTransition?: VideoTransition;
}

export type VideoSegmentStatus =
  | 'pending'
  | 'generating'
  | 'completed'
  | 'failed'
  | 'retrying';

export interface VideoTransition {
  type: 'cut' | 'crossfade' | 'flash' | 'zoom' | 'glitch' | 'wipe';
  duration: number; // seconds
}

export interface VideoProject {
  /** Unique project id */
  id: string;
  /** Song analysis data */
  analysis: SongAnalysis;
  /** Video segments to generate */
  segments: VideoSegment[];
  /** Overall narrative theme */
  narrativeTheme: string;
  /** Target video provider */
  provider: VideoProvider;
  /** Provider API key */
  apiKey: string;
  /** Output resolution */
  resolution: '480p' | '720p' | '1080p';
  /** Aspect ratio */
  aspectRatio: '16:9' | '9:16' | '4:3' | '1:1';
  /** Overall project status */
  status: ProjectStatus;
  /** URL of final assembled video */
  outputUrl?: string;
}

export type ProjectStatus =
  | 'analyzing'
  | 'prompting'
  | 'generating'
  | 'assembling'
  | 'completed'
  | 'failed';

// ── Provider API Types ──────────────────────────────────────────────

export interface VideoProviderConfig {
  provider: VideoProvider;
  apiKey: string;
  baseUrl?: string;
}

export interface GenerateClipRequest {
  prompt: string;
  duration: number; // seconds (typically 4-15)
  resolution: string;
  aspectRatio: string;
  referenceImage?: string;
  style?: Record<string, unknown>;
}

export interface GenerateClipResponse {
  id: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  clipUrl?: string;
  error?: string;
  estimatedTime?: number;
}

// ── Prompt Engineering Types ────────────────────────────────────────

export interface PromptContext {
  section: SongSection;
  transition?: Transition;
  style: VisualStyle;
  narrativeTheme: string;
  previousPrompt?: string;
  sectionIndex: number;
  totalSections: number;
}

// ── Music-to-Visual Mapping ─────────────────────────────────────────

export const SECTION_VISUAL_DEFAULTS: Record<SectionType, Partial<VisualStyle>> = {
  intro: {
    aesthetic: 'ethereal establishing shot',
    cameraStyle: 'slow dolly in',
    motionIntensity: 0.2,
    keywords: ['atmospheric', 'ambient', 'wide angle', 'cinematic fog'],
  },
  verse: {
    aesthetic: 'intimate narrative moment',
    cameraStyle: 'steady medium shot',
    motionIntensity: 0.4,
    keywords: ['storytelling', 'character focus', 'natural lighting'],
  },
  chorus: {
    aesthetic: 'vibrant high-energy spectacle',
    cameraStyle: 'dynamic tracking shot',
    motionIntensity: 0.8,
    keywords: ['vivid colors', 'dramatic lighting', 'wide angle'],
  },
  build: {
    aesthetic: 'accelerating tension',
    cameraStyle: 'push in with increasing speed',
    motionIntensity: 0.6,
    keywords: ['rising energy', 'particle effects', 'light rays', 'anticipation'],
  },
  drop: {
    aesthetic: 'explosive maximum energy',
    cameraStyle: 'rapid cuts and camera shake',
    motionIntensity: 1.0,
    keywords: ['intense', 'strobe lighting', 'bass-heavy visuals', 'impact'],
  },
  breakdown: {
    aesthetic: 'spacious atmospheric calm',
    cameraStyle: 'slow orbit or crane shot',
    motionIntensity: 0.15,
    keywords: ['dreamy', 'reverb-visual', 'soft focus', 'space'],
  },
  bridge: {
    aesthetic: 'transitional transformation',
    cameraStyle: 'whip pan or morph',
    motionIntensity: 0.5,
    keywords: ['color shift', 'perspective change', 'metamorphosis'],
  },
  outro: {
    aesthetic: 'fading resolution',
    cameraStyle: 'slow pull back',
    motionIntensity: 0.1,
    keywords: ['fade', 'dissolve', 'peaceful', 'closing'],
  },
};

export const TRANSITION_VIDEO_MAP: Record<TransitionType, VideoTransition> = {
  cut: { type: 'cut', duration: 0 },
  riser: { type: 'zoom', duration: 0.5 },
  fade: { type: 'crossfade', duration: 1.5 },
  filter: { type: 'wipe', duration: 1.0 },
  silence: { type: 'flash', duration: 0.3 },
  crossfade: { type: 'crossfade', duration: 2.0 },
};

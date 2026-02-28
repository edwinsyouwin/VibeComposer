import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

// ── Types ──────────────────────────────────────────────────────────

export type SectionType =
  | 'intro' | 'verse' | 'chorus' | 'build'
  | 'drop' | 'breakdown' | 'bridge' | 'outro';

export interface SongSection {
  id: string;
  type: SectionType;
  startTime: number;
  endTime: number;
  duration: number;
  energy: number;
  startBar: number;
  endBar: number;
}

export interface Transition {
  id: string;
  fromSection: string;
  toSection: string;
  time: number;
  type: string;
  intensity: number;
}

export interface SongAnalysis {
  bpm: number;
  key: string;
  duration: number;
  sections: SongSection[];
  transitions: Transition[];
  energyCurve: [number, number][];
}

export interface VideoSegment {
  id: string;
  sectionId: string;
  sectionType: SectionType;
  startTime: number;
  duration: number;
  prompt: string;
  outTransition: string | null;
  status: 'pending' | 'generating' | 'completed' | 'failed';
  clipUrl?: string;
}

export type VideoProvider = 'seedance' | 'runway' | 'kling';

export type ProjectStage =
  | 'idle'
  | 'analyzing'
  | 'planning'
  | 'editing'
  | 'generating'
  | 'assembling'
  | 'completed'
  | 'failed';

// ── Store ──────────────────────────────────────────────────────────

interface VideoState {
  // Project state
  stage: ProjectStage;
  error: string | null;

  // Audio analysis
  analysis: SongAnalysis | null;
  audioFilePath: string | null;

  // Video plan
  segments: VideoSegment[];
  narrativeTheme: string;
  genre: string;

  // Provider config
  provider: VideoProvider;
  apiKey: string;
  resolution: '480p' | '720p' | '1080p';
  aspectRatio: '16:9' | '9:16' | '4:3' | '1:1';

  // Generation progress
  generationProgress: number;
  currentSegmentIndex: number;

  // Output
  outputUrl: string | null;

  // Actions
  setStage: (stage: ProjectStage) => void;
  setError: (error: string | null) => void;
  setAnalysis: (analysis: SongAnalysis) => void;
  setAudioFilePath: (path: string) => void;
  setSegments: (segments: VideoSegment[]) => void;
  updateSegment: (id: string, updates: Partial<VideoSegment>) => void;
  setNarrativeTheme: (theme: string) => void;
  setGenre: (genre: string) => void;
  setProvider: (provider: VideoProvider) => void;
  setApiKey: (key: string) => void;
  setResolution: (res: '480p' | '720p' | '1080p') => void;
  setAspectRatio: (ratio: '16:9' | '9:16' | '4:3' | '1:1') => void;
  setGenerationProgress: (progress: number) => void;
  setCurrentSegmentIndex: (index: number) => void;
  setOutputUrl: (url: string) => void;
  reset: () => void;
}

const initialState = {
  stage: 'idle' as ProjectStage,
  error: null as string | null,
  analysis: null as SongAnalysis | null,
  audioFilePath: null as string | null,
  segments: [] as VideoSegment[],
  narrativeTheme: '',
  genre: '',
  provider: 'seedance' as VideoProvider,
  apiKey: '',
  resolution: '720p' as const,
  aspectRatio: '16:9' as const,
  generationProgress: 0,
  currentSegmentIndex: 0,
  outputUrl: null as string | null,
};

export const useVideoStore = create<VideoState>()(
  immer((set) => ({
    ...initialState,

    setStage: (stage) => set((s) => { s.stage = stage; }),
    setError: (error) => set((s) => { s.error = error; }),
    setAnalysis: (analysis) => set((s) => { s.analysis = analysis; }),
    setAudioFilePath: (path) => set((s) => { s.audioFilePath = path; }),
    setSegments: (segments) => set((s) => { s.segments = segments; }),
    updateSegment: (id, updates) => set((s) => {
      const seg = s.segments.find(seg => seg.id === id);
      if (seg) Object.assign(seg, updates);
    }),
    setNarrativeTheme: (theme) => set((s) => { s.narrativeTheme = theme; }),
    setGenre: (genre) => set((s) => { s.genre = genre; }),
    setProvider: (provider) => set((s) => { s.provider = provider; }),
    setApiKey: (key) => set((s) => { s.apiKey = key; }),
    setResolution: (res) => set((s) => { s.resolution = res; }),
    setAspectRatio: (ratio) => set((s) => { s.aspectRatio = ratio; }),
    setGenerationProgress: (progress) => set((s) => { s.generationProgress = progress; }),
    setCurrentSegmentIndex: (index) => set((s) => { s.currentSegmentIndex = index; }),
    setOutputUrl: (url) => set((s) => { s.outputUrl = url; }),
    reset: () => set(() => ({ ...initialState })),
  })),
);

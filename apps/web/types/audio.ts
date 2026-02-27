export interface DetectedNote {
  midiNote: number;
  frequency: number;
  confidence: number;
  timestamp: number;
  rms: number; // 0-1 signal energy for velocity extraction
}

export interface QuantizedNote {
  midiNote: number;
  startBeat: number;
  durationBeats: number;
  velocity: number;
  track: number;
}

export interface AudioCaptureState {
  isRecording: boolean;
  isInitialized: boolean;
  error: string | null;
  volume: number;
}

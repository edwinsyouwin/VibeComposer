export interface DetectedNote {
  midiNote: number;
  frequency: number;
  confidence: number;
  timestamp: number;
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

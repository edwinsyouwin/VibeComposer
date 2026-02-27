export interface MidiNote {
  pitch: number;
  startTick: number;
  durationTicks: number;
  velocity: number;
  channel: number;
}

export interface MidiTrack {
  name: string;
  notes: MidiNote[];
  instrument: number;
}

export interface MidiExportOptions {
  bpm: number;
  tracks: MidiTrack[];
  fileName: string;
}

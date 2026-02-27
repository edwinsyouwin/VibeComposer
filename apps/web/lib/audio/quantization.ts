import type { QuantizedNote } from '@/types/audio';
import type { RawNoteEvent } from './onsetDetection';

export type Subdivision = 'quarter' | 'eighth' | 'sixteenth';

const SUBDIV_MAP: Record<Subdivision, number> = {
  quarter: 1,
  eighth: 0.5,
  sixteenth: 0.25,
};

export function quantizeToGrid(
  events: RawNoteEvent[],
  bpm: number,
  subdivision: Subdivision = 'sixteenth',
): QuantizedNote[] {
  const subdiv = SUBDIV_MAP[subdivision];
  const msPerBeat = (60 / bpm) * 1000;

  return events.map((event) => {
    const startBeat = event.startMs / msPerBeat;
    const durationBeats = (event.endMs - event.startMs) / msPerBeat;

    const quantizedStart = Math.round(startBeat / subdiv) * subdiv;
    const quantizedDuration = Math.max(
      subdiv,
      Math.round(durationBeats / subdiv) * subdiv,
    );

    return {
      midiNote: event.midiNote,
      startBeat: quantizedStart,
      durationBeats: quantizedDuration,
      velocity: event.velocity,
      track: 0,
    };
  });
}

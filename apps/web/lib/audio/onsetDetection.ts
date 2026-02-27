import type { DetectedNote } from '@/types/audio';

export interface RawNoteEvent {
  midiNote: number;
  startMs: number;
  endMs: number;
  velocity: number;
}

export function detectOnsets(
  detectedNotes: DetectedNote[],
  silenceThresholdMs = 80,
): RawNoteEvent[] {
  if (detectedNotes.length === 0) return [];

  const events: RawNoteEvent[] = [];
  let currentNote = detectedNotes[0].midiNote;
  let startTime = detectedNotes[0].timestamp;
  let lastTime = startTime;

  for (let i = 1; i < detectedNotes.length; i++) {
    const note = detectedNotes[i];
    const gap = note.timestamp - lastTime;
    const noteChanged = note.midiNote !== currentNote;
    const silenceDetected = gap > silenceThresholdMs;

    if (noteChanged || silenceDetected) {
      if (lastTime - startTime > 50) {
        events.push({
          midiNote: currentNote,
          startMs: startTime,
          endMs: lastTime,
          velocity: 80,
        });
      }
      currentNote = note.midiNote;
      startTime = note.timestamp;
    }
    lastTime = note.timestamp;
  }

  // Push final note
  if (lastTime - startTime > 50) {
    events.push({
      midiNote: currentNote,
      startMs: startTime,
      endMs: lastTime,
      velocity: 80,
    });
  }

  return events;
}

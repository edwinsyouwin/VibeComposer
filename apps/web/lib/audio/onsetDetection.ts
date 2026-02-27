import type { DetectedNote } from '@/types/audio';

export interface RawNoteEvent {
  midiNote: number;
  startMs: number;
  endMs: number;
  velocity: number;
}

/**
 * Deglitch: remove isolated single-frame pitch jumps that are likely
 * detection errors. If a note appears for only 1-2 frames surrounded
 * by a different note, replace it with the surrounding note.
 */
function deglitch(
  notes: DetectedNote[],
  maxGlitchFrames = 2,
): DetectedNote[] {
  if (notes.length < 3) return notes;

  const result = [...notes];
  for (let i = 1; i < result.length - 1; i++) {
    // Look for short runs of a different pitch
    let glitchEnd = i;
    while (
      glitchEnd < result.length - 1 &&
      glitchEnd - i < maxGlitchFrames &&
      result[glitchEnd].midiNote !== result[i - 1].midiNote
    ) {
      glitchEnd++;
    }

    // If the run is short and the note after matches the note before, it's a glitch
    if (
      glitchEnd - i <= maxGlitchFrames &&
      glitchEnd < result.length &&
      result[glitchEnd].midiNote === result[i - 1].midiNote
    ) {
      for (let j = i; j < glitchEnd; j++) {
        result[j] = { ...result[j], midiNote: result[i - 1].midiNote };
      }
    }
  }
  return result;
}

/**
 * Detect energy spike that indicates an attack transient.
 * Returns the index of the frame where the attack is detected,
 * or the first frame index if no clear attack is found.
 */
function findAttackFrame(
  frames: DetectedNote[],
): number {
  if (frames.length < 2) return 0;

  // Look for the steepest RMS increase in the first few frames
  let maxDelta = 0;
  let attackIdx = 0;
  for (let i = 1; i < Math.min(frames.length, 6); i++) {
    const delta = frames[i].rms - frames[i - 1].rms;
    if (delta > maxDelta) {
      maxDelta = delta;
      attackIdx = i;
    }
  }

  // If the initial RMS is already high, the attack is at frame 0
  if (frames[0].rms > 0.3 || maxDelta < 0.05) return 0;

  return attackIdx;
}

/**
 * Compute velocity from RMS values across a note's frames.
 * Uses the peak RMS near the attack for velocity (louder = higher velocity).
 */
function computeVelocity(frames: DetectedNote[]): number {
  if (frames.length === 0) return 64;

  // Use peak RMS from the first ~25% of frames (attack portion)
  const attackWindow = Math.max(1, Math.floor(frames.length * 0.25));
  let peakRms = 0;
  for (let i = 0; i < attackWindow; i++) {
    if (frames[i].rms > peakRms) peakRms = frames[i].rms;
  }

  // Map RMS (0-1) to MIDI velocity (30-127)
  // Using a sqrt curve so softer input still registers audibly
  const velocity = Math.round(30 + Math.sqrt(peakRms) * 97);
  return Math.max(30, Math.min(127, velocity));
}

export function detectOnsets(
  detectedNotes: DetectedNote[],
  silenceThresholdMs = 80,
  minNoteDurationMs = 50,
): RawNoteEvent[] {
  if (detectedNotes.length === 0) return [];

  // Step 1: Deglitch — remove spurious 1-2 frame pitch jumps
  const cleaned = deglitch(detectedNotes);

  // Step 2: Segment into note groups
  const events: RawNoteEvent[] = [];
  let groupStart = 0;

  for (let i = 1; i <= cleaned.length; i++) {
    const isEnd = i === cleaned.length;
    const noteChanged = !isEnd && cleaned[i].midiNote !== cleaned[groupStart].midiNote;
    const silenceGap = !isEnd && cleaned[i].timestamp - cleaned[i - 1].timestamp > silenceThresholdMs;

    if (isEnd || noteChanged || silenceGap) {
      const frames = cleaned.slice(groupStart, i);
      const duration = frames[frames.length - 1].timestamp - frames[0].timestamp;

      if (duration >= minNoteDurationMs) {
        // Step 3: Find attack transient within this group
        const attackOffset = findAttackFrame(frames);
        const attackTime = frames[attackOffset].timestamp;

        // Step 4: Extract velocity from RMS
        const velocity = computeVelocity(frames);

        events.push({
          midiNote: frames[0].midiNote,
          startMs: attackTime,
          endMs: frames[frames.length - 1].timestamp,
          velocity,
        });
      }

      groupStart = i;
    }
  }

  return events;
}

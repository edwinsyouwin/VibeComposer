export const SCALES: Record<string, number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  pentatonic: [0, 2, 4, 7, 9],
  minorPentatonic: [0, 3, 5, 7, 10],
  blues: [0, 3, 5, 6, 7, 10],
  chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
};

export const NOTE_NAMES = [
  'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B',
];

export function getRootSemitone(key: string): number {
  return NOTE_NAMES.indexOf(key);
}

export function snapToScale(
  midiNote: number,
  key: string,
  scale: string,
): number {
  const scaleIntervals = SCALES[scale];
  if (!scaleIntervals) return midiNote;

  const root = getRootSemitone(key);
  const octave = Math.floor(midiNote / 12);
  const semitone = midiNote % 12;
  const normalizedSemitone = ((semitone - root) + 12) % 12;

  let closest = scaleIntervals[0];
  let minDist = Math.abs(normalizedSemitone - closest);

  for (const interval of scaleIntervals) {
    const dist = Math.min(
      Math.abs(normalizedSemitone - interval),
      Math.abs(normalizedSemitone - interval + 12),
      Math.abs(normalizedSemitone - interval - 12),
    );
    if (dist < minDist) {
      minDist = dist;
      closest = interval;
    }
  }

  return octave * 12 + ((closest + root) % 12);
}

export function midiNoteToName(midiNote: number): string {
  const name = NOTE_NAMES[midiNote % 12];
  const octave = Math.floor(midiNote / 12) - 1;
  return `${name}${octave}`;
}

import { NOTE_NAMES } from './scales';

export function midiToFrequency(midiNote: number): number {
  return 440 * Math.pow(2, (midiNote - 69) / 12);
}

export function frequencyToMidi(frequency: number): number {
  return Math.round(69 + 12 * Math.log2(frequency / 440));
}

export function midiToNoteName(midi: number): string {
  const name = NOTE_NAMES[midi % 12];
  const octave = Math.floor(midi / 12) - 1;
  return `${name}${octave}`;
}

export function noteNameToMidi(name: string): number {
  const match = name.match(/^([A-G]#?)(-?\d+)$/);
  if (!match) throw new Error(`Invalid note name: ${name}`);
  const [, noteName, octaveStr] = match;
  const semitone = NOTE_NAMES.indexOf(noteName);
  if (semitone === -1) throw new Error(`Invalid note: ${noteName}`);
  return (parseInt(octaveStr) + 1) * 12 + semitone;
}

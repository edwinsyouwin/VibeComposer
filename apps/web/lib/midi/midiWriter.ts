import MidiWriter from 'midi-writer-js';
import type { QuantizedNote } from '@/types/audio';

export function buildMidiFile(notes: QuantizedNote[], bpm: number): Uint8Array {
  const track = new MidiWriter.Track();
  track.setTempo(bpm);

  notes.forEach((note) => {
    const event = new MidiWriter.NoteEvent({
      pitch: [note.midiNote] as unknown as string[],
      duration: `T${Math.round(note.durationBeats * 128)}`,
      startTick: Math.round(note.startBeat * 128),
      velocity: note.velocity,
    });
    track.addEvent(event);
  });

  const write = new MidiWriter.Writer([track]);
  return new Uint8Array(write.buildFile());
}

export function downloadMidi(
  notes: QuantizedNote[],
  bpm: number,
  fileName = 'hum-session.mid',
): void {
  const fileData = buildMidiFile(notes, bpm);
  const blob = new Blob([fileData.buffer as ArrayBuffer], { type: 'audio/midi' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

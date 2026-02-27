import type { QuantizedNote } from '@/types/audio';
import { midiNoteToName } from '@/lib/theory/scales';

interface NoteBlockProps {
  note: QuantizedNote;
  pixelsPerBeat: number;
  noteHeight: number;
  minMidi: number;
  totalNotes: number;
  isSelected?: boolean;
}

export function getNoteRect(
  note: QuantizedNote,
  pixelsPerBeat: number,
  noteHeight: number,
  minMidi: number,
  totalNotes: number,
) {
  return {
    x: note.startBeat * pixelsPerBeat,
    y: (totalNotes - (note.midiNote - minMidi) - 1) * noteHeight,
    width: note.durationBeats * pixelsPerBeat - 2,
    height: noteHeight - 1,
  };
}

export function NoteBlock({
  note,
  pixelsPerBeat,
  noteHeight,
  minMidi,
  totalNotes,
  isSelected,
}: NoteBlockProps) {
  const rect = getNoteRect(note, pixelsPerBeat, noteHeight, minMidi, totalNotes);

  return (
    <div
      className={`absolute rounded-sm text-[9px] text-black font-medium flex items-end px-0.5 overflow-hidden ${
        isSelected ? 'ring-2 ring-white' : ''
      }`}
      style={{
        left: rect.x,
        top: rect.y,
        width: Math.max(rect.width, 4),
        height: rect.height,
        backgroundColor: isSelected ? '#6ee7a0' : '#4ade80',
      }}
    >
      {rect.width > 30 && midiNoteToName(note.midiNote)}
    </div>
  );
}

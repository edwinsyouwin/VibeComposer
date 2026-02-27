import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { QuantizedNote } from '@/types/audio';

interface SessionState {
  sessionId: string | null;
  bpm: number;
  key: string;
  scale: string;
  notes: QuantizedNote[];
  isRecording: boolean;
  snapToScale: boolean;
  selectedNoteIds: number[];

  // Actions
  setSessionId: (id: string) => void;
  setBpm: (bpm: number) => void;
  setKey: (key: string) => void;
  setScale: (scale: string) => void;
  addNotes: (notes: QuantizedNote[]) => void;
  updateNote: (index: number, note: Partial<QuantizedNote>) => void;
  deleteNote: (index: number) => void;
  clearNotes: () => void;
  setNotes: (notes: QuantizedNote[]) => void;
  setIsRecording: (v: boolean) => void;
  setSnapToScale: (v: boolean) => void;
  selectNote: (index: number) => void;
  deselectAll: () => void;
}

export const useSessionStore = create<SessionState>()(
  immer((set) => ({
    sessionId: null,
    bpm: 120,
    key: 'C',
    scale: 'major',
    notes: [],
    isRecording: false,
    snapToScale: true,
    selectedNoteIds: [],

    setSessionId: (id) => set((s) => { s.sessionId = id; }),
    setBpm: (bpm) => set((s) => { s.bpm = bpm; }),
    setKey: (key) => set((s) => { s.key = key; }),
    setScale: (scale) => set((s) => { s.scale = scale; }),
    addNotes: (notes) => set((s) => { s.notes.push(...notes); }),
    updateNote: (index, note) =>
      set((s) => {
        if (s.notes[index]) Object.assign(s.notes[index], note);
      }),
    deleteNote: (index) => set((s) => { s.notes.splice(index, 1); }),
    clearNotes: () => set((s) => { s.notes = []; }),
    setNotes: (notes) => set((s) => { s.notes = notes; }),
    setIsRecording: (v) => set((s) => { s.isRecording = v; }),
    setSnapToScale: (v) => set((s) => { s.snapToScale = v; }),
    selectNote: (index) =>
      set((s) => {
        if (!s.selectedNoteIds.includes(index)) {
          s.selectedNoteIds.push(index);
        }
      }),
    deselectAll: () => set((s) => { s.selectedNoteIds = []; }),
  })),
);

'use client';

import { useCallback } from 'react';
import { downloadMidi } from '@/lib/midi/midiWriter';
import { useSessionStore } from '@/lib/store/sessionStore';

export function useMidiExport() {
  const notes = useSessionStore((s) => s.notes);
  const bpm = useSessionStore((s) => s.bpm);

  const exportMidi = useCallback(() => {
    if (notes.length === 0) return;
    downloadMidi(notes, bpm);
  }, [notes, bpm]);

  return { exportMidi, hasNotes: notes.length > 0 };
}

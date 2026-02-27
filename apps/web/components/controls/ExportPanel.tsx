'use client';

import { Download } from 'lucide-react';
import { useMidiExport } from '@/hooks/useMidiExport';

export function ExportPanel() {
  const { exportMidi, hasNotes } = useMidiExport();

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={exportMidi}
        disabled={!hasNotes}
        className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-500 disabled:opacity-30 disabled:cursor-not-allowed rounded-lg text-sm font-medium transition-colors"
      >
        <Download size={16} />
        Export MIDI
      </button>
    </div>
  );
}

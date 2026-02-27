'use client';

import { useParams } from 'next/navigation';
import { useSession } from '@/hooks/useSession';
import { KeyScaleSelector } from '@/components/controls/KeyScaleSelector';
import { BpmControl } from '@/components/controls/BpmControl';
import { TransportBar } from '@/components/controls/TransportBar';
import { PianoRoll } from '@/components/piano-roll/PianoRoll';
import { ExportPanel } from '@/components/controls/ExportPanel';
import { WaveformDisplay } from '@/components/audio/WaveformDisplay';

export default function SessionPage() {
  const params = useParams();
  const sessionId = params.id as string;
  useSession(sessionId);

  return (
    <main className="min-h-screen bg-[#0d0d0d] text-white flex flex-col gap-4 p-6">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <a href="/" className="text-gray-500 hover:text-white transition-colors text-sm">
            &larr; Home
          </a>
          <h1 className="text-xl font-semibold">Hum Studio</h1>
        </div>
        <ExportPanel />
      </header>

      {/* Controls row */}
      <div className="flex gap-6 items-center flex-wrap">
        <BpmControl />
        <KeyScaleSelector />
      </div>

      {/* Waveform / volume indicator during recording */}
      <WaveformDisplay />

      {/* Transport controls */}
      <TransportBar />

      {/* Piano roll */}
      <div className="flex-1">
        <PianoRoll />
      </div>

      <footer className="text-xs text-gray-600 text-center">
        Right-click a note to delete it. Drag to move. Drag right edge to resize.
      </footer>
    </main>
  );
}

'use client';

import { midiNoteToName } from '@/lib/theory/scales';

interface PitchVisualizerProps {
  currentMidiNote: number | null;
  confidence: number;
}

export function PitchVisualizer({
  currentMidiNote,
  confidence,
}: PitchVisualizerProps) {
  if (currentMidiNote === null) {
    return (
      <div className="text-sm text-gray-500">
        No pitch detected
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <div className="text-2xl font-bold text-green-400">
        {midiNoteToName(currentMidiNote)}
      </div>
      <div className="flex flex-col gap-1">
        <div className="text-xs text-gray-400">MIDI: {currentMidiNote}</div>
        <div className="w-24 h-1.5 bg-[#2a2a2a] rounded-full overflow-hidden">
          <div
            className="h-full bg-green-400 rounded-full transition-all"
            style={{ width: `${confidence * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}

'use client';

import { useSessionStore } from '@/lib/store/sessionStore';

export function WaveformDisplay() {
  const isRecording = useSessionStore((s) => s.isRecording);

  if (!isRecording) return null;

  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-[#1a1a1a] rounded-lg border border-red-900/30">
      <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
      <span className="text-sm text-red-400 font-medium">Recording...</span>
      <div className="flex gap-0.5 items-center ml-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="w-1 bg-red-400 rounded-full animate-pulse"
            style={{
              height: `${8 + Math.random() * 16}px`,
              animationDelay: `${i * 0.1}s`,
              animationDuration: `${0.3 + Math.random() * 0.4}s`,
            }}
          />
        ))}
      </div>
    </div>
  );
}

'use client';

import { useSessionStore } from '@/lib/store/sessionStore';

export function BpmControl() {
  const bpm = useSessionStore((s) => s.bpm);
  const setBpm = useSessionStore((s) => s.setBpm);

  return (
    <div className="flex items-center gap-2">
      <label className="text-sm text-gray-400">BPM</label>
      <button
        onClick={() => setBpm(Math.max(40, bpm - 5))}
        className="w-7 h-7 bg-[#1e1e1e] hover:bg-[#2a2a2a] rounded text-sm flex items-center justify-center"
      >
        -
      </button>
      <input
        type="number"
        min={40}
        max={300}
        value={bpm}
        onChange={(e) => {
          const v = parseInt(e.target.value, 10);
          if (!isNaN(v) && v >= 40 && v <= 300) setBpm(v);
        }}
        className="w-16 bg-[#1e1e1e] border border-[#2a2a2a] rounded px-2 py-1 text-sm text-center text-white"
      />
      <button
        onClick={() => setBpm(Math.min(300, bpm + 5))}
        className="w-7 h-7 bg-[#1e1e1e] hover:bg-[#2a2a2a] rounded text-sm flex items-center justify-center"
      >
        +
      </button>
    </div>
  );
}

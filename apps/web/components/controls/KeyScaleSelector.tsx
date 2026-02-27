'use client';

import { useSessionStore } from '@/lib/store/sessionStore';
import { NOTE_NAMES, SCALES } from '@/lib/theory/scales';

export function KeyScaleSelector() {
  const key = useSessionStore((s) => s.key);
  const scale = useSessionStore((s) => s.scale);
  const snapToScale = useSessionStore((s) => s.snapToScale);
  const setKey = useSessionStore((s) => s.setKey);
  const setScale = useSessionStore((s) => s.setScale);
  const setSnapToScale = useSessionStore((s) => s.setSnapToScale);

  return (
    <div className="flex gap-3 items-center">
      <div className="flex gap-2 items-center">
        <label className="text-sm text-gray-400">Key</label>
        <select
          value={key}
          onChange={(e) => setKey(e.target.value)}
          className="bg-[#1e1e1e] border border-[#2a2a2a] rounded px-2 py-1 text-sm text-white"
        >
          {NOTE_NAMES.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </div>

      <div className="flex gap-2 items-center">
        <label className="text-sm text-gray-400">Scale</label>
        <select
          value={scale}
          onChange={(e) => setScale(e.target.value)}
          className="bg-[#1e1e1e] border border-[#2a2a2a] rounded px-2 py-1 text-sm text-white"
        >
          {Object.keys(SCALES).map((s) => (
            <option key={s} value={s}>
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </option>
          ))}
        </select>
      </div>

      <label className="flex items-center gap-1.5 text-sm text-gray-400 cursor-pointer">
        <input
          type="checkbox"
          checked={snapToScale}
          onChange={(e) => setSnapToScale(e.target.checked)}
          className="rounded bg-[#1e1e1e] border-[#2a2a2a]"
        />
        Snap
      </label>
    </div>
  );
}

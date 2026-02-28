'use client';

import { useState } from 'react';
import { useVideoStore } from '@/lib/video/videoStore';

const SECTION_COLORS: Record<string, string> = {
  intro: '#3b82f6',
  verse: '#22c55e',
  chorus: '#f59e0b',
  build: '#ef4444',
  drop: '#dc2626',
  breakdown: '#8b5cf6',
  bridge: '#06b6d4',
  outro: '#6b7280',
};

/**
 * Editor for reviewing and customizing video segment prompts.
 * Allows per-segment prompt editing before generation.
 */
export function SectionStyleEditor() {
  const segments = useVideoStore((s) => s.segments);
  const updateSegment = useVideoStore((s) => s.updateSegment);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <section className="bg-[#1a1a1a] rounded-lg p-4 border border-gray-800">
      <h3 className="text-sm font-medium text-gray-300 mb-3">
        3. Review & Edit Prompts ({segments.length} segments)
      </h3>

      <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
        {segments.map((segment, index) => {
          const isExpanded = expandedId === segment.id;
          const color = SECTION_COLORS[segment.sectionType] || '#555';

          return (
            <div
              key={segment.id}
              className="bg-[#111] rounded border border-gray-800 overflow-hidden"
            >
              {/* Collapsed header */}
              <button
                onClick={() => setExpandedId(isExpanded ? null : segment.id)}
                className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-[#1a1a1a] transition-colors"
              >
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: color }}
                />
                <span className="text-xs font-mono text-gray-500 w-6">
                  {index + 1}
                </span>
                <span
                  className="text-xs font-medium px-1.5 py-0.5 rounded"
                  style={{ backgroundColor: color + '30', color }}
                >
                  {segment.sectionType}
                </span>
                <span className="text-xs text-gray-500 flex-1">
                  {formatTime(segment.startTime)} - {formatTime(segment.startTime + segment.duration)}
                </span>
                <span className={`text-xs ${
                  segment.status === 'completed' ? 'text-green-400' :
                  segment.status === 'generating' ? 'text-amber-400' :
                  segment.status === 'failed' ? 'text-red-400' :
                  'text-gray-600'
                }`}>
                  {segment.status}
                </span>
                <span className="text-gray-600 text-xs">
                  {isExpanded ? '\u25B2' : '\u25BC'}
                </span>
              </button>

              {/* Expanded editor */}
              {isExpanded && (
                <div className="px-3 pb-3 space-y-2 border-t border-gray-800">
                  <div className="pt-2">
                    <label className="text-xs text-gray-500 mb-1 block">
                      Video Prompt
                    </label>
                    <textarea
                      value={segment.prompt}
                      onChange={(e) => updateSegment(segment.id, { prompt: e.target.value })}
                      rows={4}
                      className="w-full bg-[#0d0d0d] border border-gray-700 rounded px-3 py-2 text-xs text-white placeholder-gray-600 focus:border-blue-500 focus:outline-none resize-y font-mono"
                    />
                  </div>

                  <div className="flex gap-4 text-xs text-gray-500">
                    <span>Duration: {segment.duration.toFixed(1)}s</span>
                    {segment.outTransition && (
                      <span>Transition: {segment.outTransition}</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

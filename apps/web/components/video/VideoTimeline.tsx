'use client';

import { useRef, useEffect, useCallback } from 'react';
import { useVideoStore, type SongSection, type VideoSegment } from '@/lib/video/videoStore';

const SECTION_COLORS: Record<string, string> = {
  intro: '#3b82f6',     // blue
  verse: '#22c55e',     // green
  chorus: '#f59e0b',    // amber
  build: '#ef4444',     // red
  drop: '#dc2626',      // dark red
  breakdown: '#8b5cf6', // purple
  bridge: '#06b6d4',    // cyan
  outro: '#6b7280',     // gray
};

const TRANSITION_ICONS: Record<string, string> = {
  cut: '|',
  riser: '/',
  fade: '~',
  filter: '%',
  silence: '_',
  crossfade: 'X',
};

/**
 * Visual timeline showing song structure, sections, transitions,
 * energy curve, and video segment status.
 */
export function VideoTimeline() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const analysis = useVideoStore((s) => s.analysis);
  const segments = useVideoStore((s) => s.segments);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !analysis) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const W = rect.width;
    const H = rect.height;
    const duration = analysis.duration;

    // Background
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, W, H);

    const timeToX = (t: number) => (t / duration) * W;

    // ── Draw energy curve ────────────────────────────────
    if (analysis.energyCurve && analysis.energyCurve.length > 0) {
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.lineWidth = 1;

      const energyY = (e: number) => H - 20 - e * (H - 60);

      for (let i = 0; i < analysis.energyCurve.length; i++) {
        const [time, energy] = analysis.energyCurve[i];
        const x = timeToX(time);
        const y = energyY(energy);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // Fill under curve
      const lastPoint = analysis.energyCurve[analysis.energyCurve.length - 1];
      ctx.lineTo(timeToX(lastPoint[0]), H - 20);
      ctx.lineTo(timeToX(analysis.energyCurve[0][0]), H - 20);
      ctx.closePath();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
      ctx.fill();
    }

    // ── Draw sections ────────────────────────────────────
    const sectionY = 8;
    const sectionH = 36;

    for (const section of analysis.sections) {
      const x = timeToX(section.startTime);
      const w = timeToX(section.endTime) - x;
      const color = SECTION_COLORS[section.type] || '#555';

      // Section block
      ctx.fillStyle = color + '40'; // 25% opacity
      ctx.fillRect(x, sectionY, w, sectionH);

      // Section border
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, sectionY + 0.5, w - 1, sectionH - 1);

      // Section label
      ctx.fillStyle = '#fff';
      ctx.font = '11px system-ui';
      ctx.textAlign = 'center';
      const label = section.type.toUpperCase();
      if (w > 40) {
        ctx.fillText(label, x + w / 2, sectionY + 22);
      }

      // Energy indicator
      ctx.fillStyle = color + '80';
      const energyH = section.energy * 6;
      ctx.fillRect(x + 2, sectionY + sectionH - energyH - 2, w - 4, energyH);
    }

    // ── Draw transitions ─────────────────────────────────
    for (const transition of analysis.transitions) {
      const x = timeToX(transition.time);

      // Transition line
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(x, sectionY);
      ctx.lineTo(x, H - 10);
      ctx.stroke();
      ctx.setLineDash([]);

      // Transition icon
      const icon = TRANSITION_ICONS[transition.type] || '?';
      ctx.fillStyle = '#f59e0b';
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(icon, x, sectionY + sectionH + 12);
    }

    // ── Draw video segments (status row) ─────────────────
    const segY = sectionY + sectionH + 20;
    const segH = 20;

    for (const segment of segments) {
      const x = timeToX(segment.startTime);
      const w = Math.max(timeToX(segment.startTime + segment.duration) - x, 4);

      const statusColor: Record<string, string> = {
        pending: '#333',
        generating: '#f59e0b',
        completed: '#22c55e',
        failed: '#ef4444',
      };

      ctx.fillStyle = statusColor[segment.status] || '#333';
      ctx.fillRect(x, segY, w, segH);

      ctx.strokeStyle = '#555';
      ctx.lineWidth = 0.5;
      ctx.strokeRect(x + 0.5, segY + 0.5, w - 1, segH - 1);

      // Clip indicator
      if (segment.status === 'completed') {
        ctx.fillStyle = '#fff';
        ctx.font = '9px system-ui';
        ctx.textAlign = 'center';
        if (w > 20) ctx.fillText('OK', x + w / 2, segY + 14);
      }
    }

    // ── Labels ───────────────────────────────────────────
    ctx.fillStyle = '#666';
    ctx.font = '9px system-ui';
    ctx.textAlign = 'left';
    ctx.fillText('SECTIONS', 4, sectionY + sectionH + 10);
    ctx.fillText('CLIPS', 4, segY + segH + 12);

    // ── Time ruler ───────────────────────────────────────
    const rulerY = H - 12;
    ctx.fillStyle = '#444';
    ctx.font = '9px monospace';
    ctx.textAlign = 'center';

    const tickInterval = duration > 120 ? 30 : duration > 60 ? 15 : 5;
    for (let t = 0; t <= duration; t += tickInterval) {
      const x = timeToX(t);
      ctx.fillRect(x, rulerY - 4, 1, 4);

      const mins = Math.floor(t / 60);
      const secs = Math.floor(t % 60);
      ctx.fillText(`${mins}:${secs.toString().padStart(2, '0')}`, x, rulerY + 8);
    }
  }, [analysis, segments]);

  useEffect(() => {
    draw();
    const handleResize = () => draw();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [draw]);

  if (!analysis) {
    return (
      <div className="bg-[#111] rounded-lg p-8 text-center text-gray-500 border border-gray-800">
        <p className="text-sm">Upload or export audio to visualize song structure</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-400">Song Structure Timeline</h3>
        <div className="flex gap-3 text-xs text-gray-500">
          <span>{analysis.bpm} BPM</span>
          <span>{analysis.key}</span>
          <span>{Math.round(analysis.duration)}s</span>
          <span>{analysis.sections.length} sections</span>
        </div>
      </div>

      <canvas
        ref={canvasRef}
        className="w-full rounded-lg border border-gray-800 cursor-crosshair"
        style={{ height: '140px' }}
      />

      {/* Section legend */}
      <div className="flex flex-wrap gap-3 text-xs">
        {Object.entries(SECTION_COLORS).map(([type, color]) => (
          <span key={type} className="flex items-center gap-1">
            <span
              className="w-3 h-3 rounded-sm inline-block"
              style={{ backgroundColor: color + '80' }}
            />
            <span className="text-gray-400">{type}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

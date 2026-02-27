'use client';

import { useRef, useEffect, useCallback, useState } from 'react';
import { useSessionStore } from '@/lib/store/sessionStore';
import { midiNoteToName } from '@/lib/theory/scales';
import type { QuantizedNote } from '@/types/audio';

const PIXELS_PER_BEAT = 80;
const NOTE_HEIGHT = 12;
const TOTAL_MIDI_NOTES = 88;
const MIN_MIDI = 21; // A0
const PIANO_KEY_WIDTH = 48;
const RESIZE_HANDLE_WIDTH = 8;

type DragMode = 'move' | 'resize' | null;

interface DragState {
  noteIndex: number;
  mode: DragMode;
  startX: number;
  startY: number;
  originalNote: QuantizedNote;
}

export function PianoRoll() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<DragState | null>(null);
  const [hoveredNote, setHoveredNote] = useState<number | null>(null);

  const notes = useSessionStore((s) => s.notes);
  const updateNote = useSessionStore((s) => s.updateNote);
  const deleteNote = useSessionStore((s) => s.deleteNote);

  const canvasWidth = 1200;
  const canvasHeight = TOTAL_MIDI_NOTES * NOTE_HEIGHT;

  const getNoteAtPosition = useCallback(
    (canvasX: number, canvasY: number): { index: number; nearRightEdge: boolean } | null => {
      const x = canvasX - PIANO_KEY_WIDTH;
      for (let i = notes.length - 1; i >= 0; i--) {
        const note = notes[i];
        const noteX = note.startBeat * PIXELS_PER_BEAT;
        const noteY =
          (TOTAL_MIDI_NOTES - (note.midiNote - MIN_MIDI) - 1) * NOTE_HEIGHT;
        const noteW = note.durationBeats * PIXELS_PER_BEAT - 2;
        const noteH = NOTE_HEIGHT - 1;

        if (x >= noteX && x <= noteX + noteW && canvasY >= noteY && canvasY <= noteY + noteH) {
          const nearRightEdge = x >= noteX + noteW - RESIZE_HANDLE_WIDTH;
          return { index: i, nearRightEdge };
        }
      }
      return null;
    },
    [notes],
  );

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw piano keys
    for (let i = 0; i < TOTAL_MIDI_NOTES; i++) {
      const midi = MIN_MIDI + TOTAL_MIDI_NOTES - 1 - i;
      const y = i * NOTE_HEIGHT;
      const isBlackKey = [1, 3, 6, 8, 10].includes(midi % 12);

      ctx.fillStyle = isBlackKey ? '#1a1a1a' : '#222';
      ctx.fillRect(0, y, PIANO_KEY_WIDTH, NOTE_HEIGHT);

      ctx.strokeStyle = '#333';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(0, y + NOTE_HEIGHT);
      ctx.lineTo(PIANO_KEY_WIDTH, y + NOTE_HEIGHT);
      ctx.stroke();

      // Label C notes
      if (midi % 12 === 0) {
        ctx.fillStyle = '#888';
        ctx.font = '9px sans-serif';
        ctx.fillText(midiNoteToName(midi), 4, y + NOTE_HEIGHT - 2);
      }
    }

    // Draw separator line
    ctx.strokeStyle = '#444';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(PIANO_KEY_WIDTH, 0);
    ctx.lineTo(PIANO_KEY_WIDTH, canvas.height);
    ctx.stroke();

    // Draw horizontal grid lines (per note row)
    for (let i = 0; i <= TOTAL_MIDI_NOTES; i++) {
      const y = i * NOTE_HEIGHT;
      const midi = MIN_MIDI + TOTAL_MIDI_NOTES - 1 - i;
      const isBlackKey = [1, 3, 6, 8, 10].includes(midi % 12);

      ctx.fillStyle = isBlackKey ? '#0f0f0f' : '#141414';
      ctx.fillRect(PIANO_KEY_WIDTH, y, canvas.width - PIANO_KEY_WIDTH, NOTE_HEIGHT);

      ctx.strokeStyle = '#1e1e1e';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(PIANO_KEY_WIDTH, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }

    // Draw vertical grid lines (per beat)
    const totalBeats = (canvas.width - PIANO_KEY_WIDTH) / PIXELS_PER_BEAT;
    for (let beat = 0; beat <= totalBeats; beat++) {
      const x = PIANO_KEY_WIDTH + beat * PIXELS_PER_BEAT;
      const isMeasure = beat % 4 === 0;
      ctx.strokeStyle = isMeasure ? '#333' : '#1e1e1e';
      ctx.lineWidth = isMeasure ? 1 : 0.5;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }

    // Draw notes
    notes.forEach((note: QuantizedNote, i: number) => {
      const x = PIANO_KEY_WIDTH + note.startBeat * PIXELS_PER_BEAT;
      const y =
        (TOTAL_MIDI_NOTES - (note.midiNote - MIN_MIDI) - 1) * NOTE_HEIGHT;
      const w = note.durationBeats * PIXELS_PER_BEAT - 2;
      const h = NOTE_HEIGHT - 1;

      const isHovered = hoveredNote === i;
      ctx.fillStyle = isHovered ? '#6ee7a0' : '#4ade80';
      ctx.beginPath();
      ctx.roundRect(x, y, Math.max(w, 4), h, 2);
      ctx.fill();

      // Draw resize handle
      if (isHovered && w > RESIZE_HANDLE_WIDTH * 2) {
        ctx.fillStyle = '#2dd472';
        ctx.fillRect(x + w - RESIZE_HANDLE_WIDTH, y, RESIZE_HANDLE_WIDTH, h);
      }

      // Note label for wider notes
      if (w > 30) {
        ctx.fillStyle = '#000';
        ctx.font = '9px sans-serif';
        ctx.fillText(midiNoteToName(note.midiNote), x + 3, y + h - 2);
      }
    });
  }, [notes, hoveredNote]);

  useEffect(() => {
    draw();
  }, [draw]);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      const hit = getNoteAtPosition(x, y);
      if (hit) {
        dragState.current = {
          noteIndex: hit.index,
          mode: hit.nearRightEdge ? 'resize' : 'move',
          startX: x,
          startY: y,
          originalNote: { ...notes[hit.index] },
        };
      }
    },
    [notes, getNoteAtPosition],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      if (!dragState.current) {
        // Just hovering — update cursor and hover state
        const hit = getNoteAtPosition(x, y);
        setHoveredNote(hit ? hit.index : null);
        if (hit) {
          canvas.style.cursor = hit.nearRightEdge ? 'ew-resize' : 'grab';
        } else {
          canvas.style.cursor = 'default';
        }
        return;
      }

      const { noteIndex, mode, startX, startY, originalNote } =
        dragState.current;
      const dx = x - startX;
      const dy = y - startY;

      if (mode === 'move') {
        const beatDelta = dx / PIXELS_PER_BEAT;
        const noteDelta = -Math.round(dy / NOTE_HEIGHT);
        updateNote(noteIndex, {
          startBeat: Math.max(0, originalNote.startBeat + beatDelta),
          midiNote: Math.max(
            MIN_MIDI,
            Math.min(MIN_MIDI + TOTAL_MIDI_NOTES - 1, originalNote.midiNote + noteDelta),
          ),
        });
      } else if (mode === 'resize') {
        const beatDelta = dx / PIXELS_PER_BEAT;
        updateNote(noteIndex, {
          durationBeats: Math.max(0.25, originalNote.durationBeats + beatDelta),
        });
      }
    },
    [getNoteAtPosition, updateNote],
  );

  const handleMouseUp = useCallback(() => {
    if (dragState.current) {
      // Snap to grid on release
      const { noteIndex } = dragState.current;
      const note = notes[noteIndex];
      if (note) {
        const snapUnit = 0.25;
        updateNote(noteIndex, {
          startBeat: Math.max(0, Math.round(note.startBeat / snapUnit) * snapUnit),
          durationBeats: Math.max(
            snapUnit,
            Math.round(note.durationBeats / snapUnit) * snapUnit,
          ),
        });
      }
      dragState.current = null;
    }
  }, [notes, updateNote]);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      const hit = getNoteAtPosition(x, y);
      if (hit) {
        deleteNote(hit.index);
      }
    },
    [getNoteAtPosition, deleteNote],
  );

  return (
    <div
      ref={containerRef}
      className="overflow-auto bg-[#111] rounded-lg border border-[#2a2a2a] max-h-[500px]"
    >
      <canvas
        ref={canvasRef}
        width={canvasWidth}
        height={canvasHeight}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onContextMenu={handleContextMenu}
      />
    </div>
  );
}

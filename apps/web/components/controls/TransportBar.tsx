'use client';

import { useState } from 'react';
import { Mic, Square, Trash2, Play, StopCircle } from 'lucide-react';
import { useAudioCapture } from '@/hooks/useAudioCapture';
import { useSessionStore } from '@/lib/store/sessionStore';
import { playNotes, stopPlayback } from '@/lib/midi/midiPlayer';

export function TransportBar() {
  const { startRecording, stopRecording, volume } = useAudioCapture();
  const isRecording = useSessionStore((s) => s.isRecording);
  const clearNotes = useSessionStore((s) => s.clearNotes);
  const notes = useSessionStore((s) => s.notes);
  const bpm = useSessionStore((s) => s.bpm);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const handleRecord = async () => {
    if (isRecording) {
      stopRecording();
    } else {
      // 1-bar count-in
      for (let i = 4; i >= 1; i--) {
        setCountdown(i);
        await new Promise((r) => setTimeout(r, (60 / bpm) * 1000));
      }
      setCountdown(null);
      await startRecording();
    }
  };

  const handlePlay = async () => {
    if (isPlaying) {
      stopPlayback();
      setIsPlaying(false);
    } else if (notes.length > 0) {
      setIsPlaying(true);
      await playNotes(notes, bpm);
      // Estimate total duration to auto-stop
      const maxEnd = Math.max(
        ...notes.map((n) => n.startBeat + n.durationBeats),
      );
      const durationMs = (maxEnd * 60 * 1000) / bpm;
      setTimeout(() => setIsPlaying(false), durationMs + 200);
    }
  };

  return (
    <div className="flex items-center gap-4">
      {countdown !== null && (
        <span className="text-4xl font-bold text-yellow-400 w-12 text-center">
          {countdown}
        </span>
      )}

      <button
        onClick={handleRecord}
        className={`p-4 rounded-full transition-all ${
          isRecording
            ? 'bg-red-600 animate-pulse scale-110'
            : 'bg-[#1e1e1e] hover:bg-[#2a2a2a]'
        }`}
        title={isRecording ? 'Stop recording' : 'Start recording'}
      >
        {isRecording ? <Square size={24} /> : <Mic size={24} />}
      </button>

      <button
        onClick={handlePlay}
        disabled={notes.length === 0}
        className={`p-3 rounded-full transition-all ${
          isPlaying
            ? 'bg-blue-600'
            : 'bg-[#1e1e1e] hover:bg-[#2a2a2a] disabled:opacity-30 disabled:cursor-not-allowed'
        }`}
        title={isPlaying ? 'Stop playback' : 'Play'}
      >
        {isPlaying ? <StopCircle size={20} /> : <Play size={20} />}
      </button>

      {/* Volume meter */}
      <div className="flex gap-0.5 items-end h-8">
        {Array.from({ length: 20 }).map((_, i) => (
          <div
            key={i}
            className={`w-1.5 rounded-sm transition-all ${
              i / 20 < volume ? 'bg-green-400' : 'bg-[#2a2a2a]'
            }`}
            style={{ height: `${40 + i * 3}%` }}
          />
        ))}
      </div>

      <button
        onClick={clearNotes}
        disabled={notes.length === 0}
        className="p-2 text-gray-500 hover:text-red-400 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        title="Clear all notes"
      >
        <Trash2 size={18} />
      </button>

      {notes.length > 0 && (
        <span className="text-xs text-gray-500">
          {notes.length} note{notes.length !== 1 ? 's' : ''}
        </span>
      )}
    </div>
  );
}

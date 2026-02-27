'use client';

import { useRef, useState, useCallback } from 'react';
import { AudioCapture } from '@/lib/audio/audioCapture';
import { PitchDetector } from '@/lib/audio/pitchDetection';
import { snapToScale } from '@/lib/theory/scales';
import { detectOnsets } from '@/lib/audio/onsetDetection';
import { quantizeToGrid } from '@/lib/audio/quantization';
import { useSessionStore } from '@/lib/store/sessionStore';
import type { DetectedNote } from '@/types/audio';

export function useAudioCapture() {
  const capture = useRef<AudioCapture | null>(null);
  const detector = useRef<PitchDetector | null>(null);
  const rawNotes = useRef<DetectedNote[]>([]);
  const volumeInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const [volume, setVolume] = useState(0);

  const bpm = useSessionStore((s) => s.bpm);
  const key = useSessionStore((s) => s.key);
  const scale = useSessionStore((s) => s.scale);
  const shouldSnap = useSessionStore((s) => s.snapToScale);
  const addNotes = useSessionStore((s) => s.addNotes);
  const setIsRecording = useSessionStore((s) => s.setIsRecording);

  const startRecording = useCallback(async () => {
    const cap = new AudioCapture();
    capture.current = cap;
    await cap.initialize();

    const det = new PitchDetector();
    det.initialize(44100);
    detector.current = det;

    rawNotes.current = [];
    setIsRecording(true);

    volumeInterval.current = setInterval(() => {
      if (capture.current) {
        setVolume(capture.current.getVolumeLevel());
      }
    }, 50);

    cap.startCapture((buffer, timestamp) => {
      if (!detector.current) return;
      const result = detector.current.detectPitch(buffer);
      if (result) {
        let midiNote = detector.current.frequencyToMidi(result.frequency);
        if (shouldSnap) {
          midiNote = snapToScale(midiNote, key, scale);
        }
        rawNotes.current.push({
          midiNote,
          frequency: result.frequency,
          confidence: result.confidence,
          timestamp,
        });
      }
    });
  }, [key, scale, shouldSnap, setIsRecording]);

  const stopRecording = useCallback(() => {
    if (volumeInterval.current) {
      clearInterval(volumeInterval.current);
      volumeInterval.current = null;
    }

    capture.current?.stop();
    capture.current = null;
    setIsRecording(false);
    setVolume(0);

    const onsets = detectOnsets(rawNotes.current);
    const quantized = quantizeToGrid(onsets, bpm);
    if (quantized.length > 0) addNotes(quantized);
    rawNotes.current = [];

    detector.current?.dispose();
    detector.current = null;
  }, [bpm, addNotes, setIsRecording]);

  return { startRecording, stopRecording, volume };
}

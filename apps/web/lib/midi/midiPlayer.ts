import type { QuantizedNote } from '@/types/audio';

// Tone.js is dynamically imported to avoid SSR issues
type ToneModule = typeof import('tone');
let Tone: ToneModule | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let synth: any = null;

async function loadTone(): Promise<ToneModule> {
  if (!Tone) {
    Tone = await import('tone');
  }
  return Tone;
}

function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export async function playNotes(
  notes: QuantizedNote[],
  bpm: number,
): Promise<void> {
  const T = await loadTone();
  await T.start();

  if (!synth) {
    synth = new T.PolySynth(T.Synth, {
      oscillator: { type: 'triangle' },
      envelope: {
        attack: 0.02,
        decay: 0.1,
        sustain: 0.3,
        release: 0.3,
      },
    }).toDestination();
  }

  const secPerBeat = 60 / bpm;
  const now = T.now();
  notes.forEach((note) => {
    const startTime = now + note.startBeat * secPerBeat;
    const duration = note.durationBeats * secPerBeat;
    synth.triggerAttackRelease(
      midiToFreq(note.midiNote),
      duration,
      startTime,
      note.velocity / 127,
    );
  });
}

export function stopPlayback(): void {
  if (synth) {
    synth.releaseAll();
  }
}

export function disposeSynth(): void {
  if (synth) {
    synth.dispose();
    synth = null;
  }
}

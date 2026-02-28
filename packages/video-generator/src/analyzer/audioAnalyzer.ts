import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import type { SongAnalysis } from '../types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SCRIPT_PATH = join(__dirname, '..', '..', 'scripts', 'analyze_audio.py');

/**
 * Analyze an audio file using the Python librosa-based pipeline.
 * Returns structured song analysis with sections, beats, and transitions.
 */
export async function analyzeAudio(audioPath: string): Promise<SongAnalysis> {
  const tempDir = await mkdtemp(join(tmpdir(), 'vibecomposer-'));
  const outputPath = join(tempDir, 'analysis.json');

  return new Promise((resolve, reject) => {
    const proc = spawn('python3', [SCRIPT_PATH, audioPath, '--output', outputPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stderr = '';

    proc.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    proc.on('close', async (code) => {
      if (code !== 0) {
        reject(new Error(`Audio analysis failed (exit code ${code}): ${stderr}`));
        return;
      }

      try {
        const raw = await readFile(outputPath, 'utf-8');
        const analysis = JSON.parse(raw) as SongAnalysis;
        resolve(analysis);
      } catch (err) {
        reject(new Error(`Failed to parse analysis output: ${err}`));
      }
    });

    proc.on('error', (err) => {
      reject(new Error(`Failed to spawn Python process: ${err.message}. Make sure Python 3 and librosa are installed.`));
    });
  });
}

/**
 * Analyze audio from raw WAV buffer (e.g. exported from Ableton).
 * Writes to a temp file first, then analyzes.
 */
export async function analyzeAudioBuffer(buffer: Buffer, format: string = 'wav'): Promise<SongAnalysis> {
  const tempDir = await mkdtemp(join(tmpdir(), 'vibecomposer-'));
  const tempPath = join(tempDir, `input.${format}`);
  await writeFile(tempPath, buffer);
  return analyzeAudio(tempPath);
}

/**
 * Lightweight in-process analysis for when Python is not available.
 * Uses the Web Audio API analysis data from the frontend instead.
 * This is a fallback that creates a SongAnalysis from session data.
 */
export function analyzeFromSessionData(params: {
  bpm: number;
  key: string;
  durationBeats: number;
  notes: Array<{ startBeat: number; velocity: number }>;
}): SongAnalysis {
  const { bpm, key, durationBeats, notes } = params;
  const secondsPerBeat = 60 / bpm;
  const duration = durationBeats * secondsPerBeat;

  // Generate beat grid
  const totalBeats = Math.ceil(durationBeats);
  const beats = Array.from({ length: totalBeats }, (_, i) => ({
    time: i * secondsPerBeat,
    beatInBar: (i % 4) + 1,
    isDownbeat: i % 4 === 0,
    energy: estimateEnergyAtBeat(i, notes),
  }));

  // Simple section detection based on energy windows
  const barsCount = Math.ceil(durationBeats / 4);
  const sections = detectSectionsFromNotes(notes, bpm, barsCount, beats);

  // Detect transitions
  const transitions = sections.slice(0, -1).map((section, i) => {
    const next = sections[i + 1];
    const energyDelta = next.energy - section.energy;
    return {
      id: `t${i}`,
      fromSection: section.id,
      toSection: next.id,
      time: section.endTime,
      type: classifyTransition(energyDelta) as import('../types.js').TransitionType,
      intensity: Math.min(Math.abs(energyDelta) * 2, 1),
    };
  });

  // Energy curve (one point per beat)
  const energyCurve: [number, number][] = beats.map(b => [b.time, b.energy]);

  return {
    audioSource: 'session',
    bpm,
    key,
    duration,
    timeSignature: '4/4',
    beats,
    sections,
    transitions,
    energyCurve,
    spectralProfile: {
      dominantBands: Object.fromEntries(sections.map(s => [s.id, 'mid' as const])),
      brightness: 0.5,
      warmth: 0.5,
    },
  };
}

function estimateEnergyAtBeat(
  beat: number,
  notes: Array<{ startBeat: number; velocity: number }>,
): number {
  // Find notes near this beat
  const nearby = notes.filter(n => Math.abs(n.startBeat - beat) < 1);
  if (nearby.length === 0) return 0.1;
  const avgVelocity = nearby.reduce((sum, n) => sum + n.velocity, 0) / nearby.length;
  return avgVelocity / 127;
}

function detectSectionsFromNotes(
  notes: Array<{ startBeat: number; velocity: number }>,
  bpm: number,
  totalBars: number,
  beats: Array<{ time: number; energy: number }>,
) {
  const secondsPerBeat = 60 / bpm;
  const barsPerSection = Math.max(4, Math.floor(totalBars / 6));

  const sections: import('../types.js').SongSection[] = [];
  let sectionIndex = 0;

  for (let bar = 0; bar < totalBars; bar += barsPerSection) {
    const endBar = Math.min(bar + barsPerSection, totalBars);
    const startTime = bar * 4 * secondsPerBeat;
    const endTime = endBar * 4 * secondsPerBeat;

    const sectionBeats = beats.filter(b => b.time >= startTime && b.time < endTime);
    const avgEnergy = sectionBeats.length > 0
      ? sectionBeats.reduce((s, b) => s + b.energy, 0) / sectionBeats.length
      : 0.3;

    const position = sectionIndex / Math.ceil(totalBars / barsPerSection);
    let type: import('../types.js').SectionType = 'verse';

    if (sectionIndex === 0 && avgEnergy < 0.5) type = 'intro';
    else if (position >= 0.9 && avgEnergy < 0.4) type = 'outro';
    else if (avgEnergy > 0.7) type = 'drop';
    else if (avgEnergy < 0.3) type = 'breakdown';
    else if (avgEnergy > 0.5) type = 'chorus';

    sections.push({
      id: `s${sectionIndex}`,
      type,
      startTime,
      endTime,
      duration: endTime - startTime,
      startBar: bar + 1,
      endBar,
      energy: avgEnergy,
      beats: sectionBeats,
    });

    sectionIndex++;
  }

  return sections;
}

function classifyTransition(energyDelta: number): string {
  if (Math.abs(energyDelta) > 0.5) return energyDelta > 0 ? 'cut' : 'silence';
  if (energyDelta > 0.2) return 'riser';
  if (energyDelta < -0.2) return 'fade';
  return 'crossfade';
}

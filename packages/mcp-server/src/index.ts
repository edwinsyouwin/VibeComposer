import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';
import * as net from 'node:net';

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || '',
);

const ABLETON_HOST = process.env.ABLETON_HOST || '127.0.0.1';
const ABLETON_PORT = parseInt(process.env.ABLETON_PORT || '9877', 10);

const server = new McpServer({
  name: 'hum-to-midi',
  version: '1.1.0',
});

// ── Ableton TCP helpers ──────────────────────────────────────────────

function sendToAbleton(command: { type: string; params?: Record<string, unknown> }): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    let data = '';

    socket.setTimeout(5000);

    socket.connect(ABLETON_PORT, ABLETON_HOST, () => {
      socket.write(JSON.stringify(command) + '\n');
    });

    socket.on('data', (chunk) => {
      data += chunk.toString();
    });

    socket.on('end', () => {
      try {
        resolve(JSON.parse(data));
      } catch {
        resolve({ status: 'ok', raw: data });
      }
    });

    socket.on('timeout', () => {
      socket.destroy();
      reject(new Error('Connection to Ableton timed out. Is Ableton Live running with the MCP Remote Script?'));
    });

    socket.on('error', (err) => {
      reject(new Error(`Cannot connect to Ableton at ${ABLETON_HOST}:${ABLETON_PORT}: ${err.message}`));
    });
  });
}

function textResult(text: string) {
  return { content: [{ type: 'text' as const, text }] };
}

// ── Supabase helpers ─────────────────────────────────────────────────

interface NoteRow {
  midi_note: number;
  start_beat: number;
  duration_beats: number;
  velocity: number;
  track: number;
}

async function fetchSessionNotes(sessionId: string) {
  const [{ data: session, error: sessionErr }, { data: notes }] = await Promise.all([
    supabase.from('sessions').select('*').eq('id', sessionId).single(),
    supabase.from('notes').select('*').eq('session_id', sessionId).order('start_beat'),
  ]);
  return { session, sessionErr, notes: (notes || []) as NoteRow[] };
}

// ── Tools: Session management ────────────────────────────────────────

server.tool(
  'get_session',
  'Retrieve a composition session and its notes',
  { sessionId: z.string().uuid() },
  async ({ sessionId }) => {
    const { session, sessionErr, notes } = await fetchSessionNotes(sessionId);
    if (sessionErr) return textResult(`Error: ${sessionErr.message}`);
    return textResult(JSON.stringify({ session, notes }, null, 2));
  },
);

server.tool(
  'add_notes',
  'Add MIDI notes to a composition session',
  {
    sessionId: z.string().uuid(),
    notes: z.array(
      z.object({
        midiNote: z.number().min(0).max(127),
        startBeat: z.number().min(0),
        durationBeats: z.number().min(0.25),
        velocity: z.number().min(1).max(127).default(80),
        track: z.number().default(0),
      }),
    ),
  },
  async ({ sessionId, notes }) => {
    const { error } = await supabase.from('notes').insert(
      notes.map((n) => ({
        session_id: sessionId,
        midi_note: n.midiNote,
        start_beat: n.startBeat,
        duration_beats: n.durationBeats,
        velocity: n.velocity,
        track: n.track,
      })),
    );
    if (error) return textResult(`Error: ${error.message}`);
    return textResult(`Added ${notes.length} notes`);
  },
);

server.tool(
  'clear_notes',
  'Remove all notes from a composition session',
  { sessionId: z.string().uuid() },
  async ({ sessionId }) => {
    const { error } = await supabase.from('notes').delete().eq('session_id', sessionId);
    if (error) return textResult(`Error: ${error.message}`);
    return textResult('Notes cleared');
  },
);

server.tool(
  'set_session_params',
  'Update session settings like BPM, key, and scale',
  {
    sessionId: z.string().uuid(),
    bpm: z.number().min(40).max(300).optional(),
    key: z.string().optional(),
    scale: z.string().optional(),
  },
  async ({ sessionId, ...params }) => {
    const updateData: Record<string, unknown> = {};
    if (params.bpm !== undefined) updateData.bpm = params.bpm;
    if (params.key !== undefined) updateData.key = params.key;
    if (params.scale !== undefined) updateData.scale = params.scale;
    updateData.updated_at = new Date().toISOString();

    const { error } = await supabase.from('sessions').update(updateData).eq('id', sessionId);
    if (error) return textResult(`Error: ${error.message}`);
    return textResult('Session updated');
  },
);

server.tool(
  'export_midi',
  'Export session notes as MIDI-compatible JSON data',
  { sessionId: z.string().uuid() },
  async ({ sessionId }) => {
    const { session, notes } = await fetchSessionNotes(sessionId);
    if (!session) return textResult('Session not found');

    const midiData = {
      bpm: session.bpm,
      key: session.key,
      scale: session.scale,
      notes: notes.map((n) => ({
        midiNote: n.midi_note,
        startBeat: Number(n.start_beat),
        durationBeats: Number(n.duration_beats),
        velocity: n.velocity,
        track: n.track,
      })),
    };
    return textResult(JSON.stringify(midiData, null, 2));
  },
);

// ── Tools: Ableton Live integration ─────────────────────────────────

server.tool(
  'send_to_ableton',
  'Send session notes to Ableton Live. Creates a MIDI track, loads an instrument, adds notes, and optionally starts playback. Requires Ableton Live with the AbletonMCP Remote Script running.',
  {
    sessionId: z.string().uuid(),
    trackName: z.string().default('Hum Studio'),
    instrument: z.string().optional().describe(
      'Ableton instrument URI to load (e.g. from browse_ableton_instruments). If omitted, uses the default instrument.',
    ),
    autoPlay: z.boolean().default(false).describe('Start playback after adding notes'),
  },
  async ({ sessionId, trackName, instrument, autoPlay }) => {
    const { session, notes } = await fetchSessionNotes(sessionId);
    if (!session) return textResult('Session not found');
    if (notes.length === 0) return textResult('No notes in session');

    try {
      // 1. Set tempo
      await sendToAbleton({ type: 'set_tempo', params: { tempo: session.bpm } });

      // 2. Create MIDI track
      const trackResult = await sendToAbleton({
        type: 'create_midi_track',
        params: { index: -1 },
      }) as { result?: { index?: number } };
      const trackIndex = trackResult?.result?.index ?? 0;

      // 3. Name the track
      await sendToAbleton({
        type: 'set_track_name',
        params: { track_index: trackIndex, name: trackName },
      });

      // 4. Load instrument if specified
      if (instrument) {
        await sendToAbleton({
          type: 'load_instrument_or_effect',
          params: { track_index: trackIndex, uri: instrument },
        });
      }

      // 5. Create a clip and add notes
      const totalBeats = Math.max(
        ...notes.map((n) => Number(n.start_beat) + Number(n.duration_beats)),
      );
      const clipLengthBars = Math.ceil(totalBeats / 4);

      await sendToAbleton({
        type: 'create_clip',
        params: {
          track_index: trackIndex,
          clip_index: 0,
          length: clipLengthBars * 4, // length in beats
        },
      });

      // Map our note format to Ableton's expected format
      const abletonNotes = notes.map((n) => ({
        pitch: n.midi_note,
        start_time: Number(n.start_beat),
        duration: Number(n.duration_beats),
        velocity: n.velocity,
      }));

      await sendToAbleton({
        type: 'add_notes_to_clip',
        params: {
          track_index: trackIndex,
          clip_index: 0,
          notes: abletonNotes,
        },
      });

      // 6. Optionally start playback
      if (autoPlay) {
        await sendToAbleton({
          type: 'fire_clip',
          params: { track_index: trackIndex, clip_index: 0 },
        });
      }

      return textResult(
        `Sent ${notes.length} notes to Ableton track "${trackName}" (index ${trackIndex}). ` +
        `Clip: ${clipLengthBars * 4} beats. ${autoPlay ? 'Playback started.' : 'Ready to play.'}`,
      );
    } catch (err) {
      return textResult(`Ableton error: ${err instanceof Error ? err.message : String(err)}`);
    }
  },
);

server.tool(
  'browse_ableton_instruments',
  'List available instruments and effects from Ableton Live\'s browser. Use a path like "Instruments" or "Drums" to drill down.',
  {
    path: z.string().default('').describe('Browser path to explore, e.g. "Instruments", "Drums", "Audio Effects"'),
  },
  async ({ path }) => {
    try {
      const command = path
        ? { type: 'get_browser_items_at_path', params: { path } }
        : { type: 'get_browser_tree' };
      const result = await sendToAbleton(command);
      return textResult(JSON.stringify(result, null, 2));
    } catch (err) {
      return textResult(`Ableton error: ${err instanceof Error ? err.message : String(err)}`);
    }
  },
);

// ── Tools: Music Video Generation ────────────────────────────────────

server.tool(
  'analyze_song_structure',
  'Analyze an audio file (WAV/MP3) exported from Ableton to detect song structure: sections (intro, build, drop, breakdown, outro), beats, transitions, energy curve, and spectral profile. This is the first step in generating a music video.',
  {
    audioPath: z.string().describe('Path to the audio file (WAV or MP3)'),
  },
  async ({ audioPath }) => {
    try {
      const { spawn } = await import('node:child_process');
      const { readFile, mkdtemp } = await import('node:fs/promises');
      const { join, dirname } = await import('node:path');
      const { fileURLToPath } = await import('node:url');
      const { tmpdir } = await import('node:os');

      const currentFilename = fileURLToPath(import.meta.url);
      const currentDirname = dirname(currentFilename);
      const scriptPath = join(currentDirname, '..', '..', 'video-generator', 'scripts', 'analyze_audio.py');

      const tempDir = await mkdtemp(join(tmpdir(), 'vibecomposer-'));
      const outputPath = join(tempDir, 'analysis.json');

      return new Promise<{ content: { type: 'text'; text: string }[] }>((resolve) => {
        const proc = spawn('python3', [scriptPath, audioPath, '--output', outputPath], {
          stdio: ['pipe', 'pipe', 'pipe'],
        });

        let stderr = '';
        proc.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });

        proc.on('close', async (code: number | null) => {
          if (code !== 0) {
            resolve(textResult(`Analysis failed: ${stderr}`));
            return;
          }
          try {
            const raw = await readFile(outputPath, 'utf-8');
            const analysis = JSON.parse(raw);
            resolve(textResult(JSON.stringify({
              summary: {
                bpm: analysis.bpm,
                key: analysis.key,
                duration: `${Math.round(analysis.duration)}s`,
                sections: analysis.sections.length,
                transitions: analysis.transitions.length,
                beats: analysis.beats.length,
              },
              sections: analysis.sections.map((s: Record<string, unknown>) => ({
                id: s.id,
                type: s.type,
                startTime: `${s.startTime}s`,
                endTime: `${s.endTime}s`,
                duration: `${s.duration}s`,
                bars: `${s.startBar}-${s.endBar}`,
                energy: s.energy,
              })),
              transitions: analysis.transitions,
              spectralProfile: analysis.spectralProfile,
              _fullAnalysis: analysis,
            }, null, 2)));
          } catch (err) {
            resolve(textResult(`Failed to parse analysis: ${err}`));
          }
        });

        proc.on('error', (err: Error) => {
          resolve(textResult(`Cannot run analysis: ${err.message}. Ensure Python 3 and librosa are installed.`));
        });
      });
    } catch (err) {
      return textResult(`Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  },
);

server.tool(
  'plan_music_video',
  'Plan a music video by generating visual prompts for each song section. Takes the analysis from analyze_song_structure and creates a complete video generation plan with prompts, styles, and transitions for each segment.',
  {
    analysisJson: z.string().describe('JSON string of the song analysis (from analyze_song_structure)'),
    narrativeTheme: z.string().describe('Overall narrative/visual theme for the video, e.g. "cyberpunk city at night", "desert journey", "abstract liquid forms"'),
    genre: z.string().optional().describe('EDM subgenre for style presets: melodic-techno, afro-tech, jersey-club, space-bass, pop-edm'),
  },
  async ({ analysisJson, narrativeTheme, genre }) => {
    try {
      const analysis = JSON.parse(analysisJson);

      const SECTION_STYLES: Record<string, { aesthetic: string; cameraStyle: string; motionIntensity: number; keywords: string[] }> = {
        intro: { aesthetic: 'ethereal establishing shot', cameraStyle: 'slow dolly in', motionIntensity: 0.2, keywords: ['atmospheric', 'ambient', 'wide angle', 'cinematic fog'] },
        verse: { aesthetic: 'intimate narrative moment', cameraStyle: 'steady medium shot', motionIntensity: 0.4, keywords: ['storytelling', 'character focus', 'natural lighting'] },
        chorus: { aesthetic: 'vibrant high-energy spectacle', cameraStyle: 'dynamic tracking shot', motionIntensity: 0.8, keywords: ['vivid colors', 'dramatic lighting', 'wide angle'] },
        build: { aesthetic: 'accelerating tension', cameraStyle: 'push in with increasing speed', motionIntensity: 0.6, keywords: ['rising energy', 'particle effects', 'light rays', 'anticipation'] },
        drop: { aesthetic: 'explosive maximum energy', cameraStyle: 'rapid cuts and camera shake', motionIntensity: 1.0, keywords: ['intense', 'strobe lighting', 'bass-heavy visuals', 'impact'] },
        breakdown: { aesthetic: 'spacious atmospheric calm', cameraStyle: 'slow orbit or crane shot', motionIntensity: 0.15, keywords: ['dreamy', 'reverb-visual', 'soft focus', 'space'] },
        bridge: { aesthetic: 'transitional transformation', cameraStyle: 'whip pan or morph', motionIntensity: 0.5, keywords: ['color shift', 'perspective change', 'metamorphosis'] },
        outro: { aesthetic: 'fading resolution', cameraStyle: 'slow pull back', motionIntensity: 0.1, keywords: ['fade', 'dissolve', 'peaceful', 'closing'] },
      };

      const GENRE_WORLDS: Record<string, { world: string; colorPalette: string; keywords: string[] }> = {
        'melodic-techno': { world: 'vast desert landscapes and futuristic architecture', colorPalette: 'amber, deep blue, warm white, bronze', keywords: ['architectural', 'geometric', 'vast scale'] },
        'afro-tech': { world: 'vibrant African-futurism city with organic technology', colorPalette: 'earth tones, gold, emerald green, sunset orange', keywords: ['organic', 'rhythmic patterns', 'cultural motifs'] },
        'jersey-club': { world: 'neon-lit urban nightscape with dance floor energy', colorPalette: 'electric purple, hot pink, chrome, black', keywords: ['urban', 'dance', 'dynamic', 'bounce'] },
        'space-bass': { world: 'deep space nebulae and alien crystalline structures', colorPalette: 'deep purple, cyan, magenta, void black', keywords: ['cosmic', 'alien', 'liquid', 'fractal'] },
        'pop-edm': { world: 'glossy festival stage with LED walls and confetti', colorPalette: 'rainbow spectrum, white, gold sparkle', keywords: ['festival', 'euphoric', 'crowd', 'lights'] },
      };

      const genreWorld = genre && GENRE_WORLDS[genre]
        ? GENRE_WORLDS[genre]
        : { world: 'abstract digital landscape with flowing light', colorPalette: 'electric blue, deep purple, white, silver', keywords: ['abstract', 'digital', 'light'] };

      const segments = [];
      for (let i = 0; i < analysis.sections.length; i++) {
        const section = analysis.sections[i];
        const sectionType = section.type as string;
        const defaults = SECTION_STYLES[sectionType] || SECTION_STYLES.verse;
        const transition = analysis.transitions?.find((t: Record<string, unknown>) => t.fromSection === section.id);

        const maxClipDuration = 10;
        const sectionDuration = typeof section.duration === 'string'
          ? parseFloat(section.duration)
          : section.duration;
        const clipCount = Math.ceil(sectionDuration / maxClipDuration);

        for (let c = 0; c < clipCount; c++) {
          const sectionStart = typeof section.startTime === 'string'
            ? parseFloat(section.startTime)
            : section.startTime;
          const clipStart = sectionStart + (c * sectionDuration / clipCount);
          const clipDuration = Math.min(sectionDuration / clipCount, maxClipDuration);
          const arcPosition = i / Math.max(analysis.sections.length - 1, 1);
          const narrativePhase = arcPosition < 0.2 ? 'opening' : arcPosition < 0.5 ? 'rising action' : arcPosition < 0.75 ? 'climax' : 'resolution';

          const prompt = [
            `Cinematic ${defaults.aesthetic}.`,
            `Theme: ${narrativeTheme}, ${narrativePhase} moment in ${genreWorld.world}.`,
            `Color palette: ${genreWorld.colorPalette}.`,
            `Camera: ${defaults.cameraStyle}.`,
            `Energy: ${section.energy > 0.7 ? 'explosive, maximum intensity' : section.energy > 0.4 ? 'moderate energy, flowing motion' : 'calm, gentle movement'}.`,
            `Style: ${[...defaults.keywords, ...genreWorld.keywords].join(', ')}.`,
            `Motion intensity: ${Math.round(defaults.motionIntensity * 100)}%.`,
            'Cinematic quality, 24fps filmic motion, professional color grading.',
          ].join(' ');

          segments.push({
            id: `seg-${section.id}-${c}`,
            sectionId: section.id,
            sectionType,
            startTime: Math.round(clipStart * 1000) / 1000,
            duration: Math.round(clipDuration * 1000) / 1000,
            prompt,
            outTransition: c === clipCount - 1 && transition ? transition.type : null,
          });
        }
      }

      return textResult(JSON.stringify({
        plan: {
          theme: narrativeTheme,
          genre: genre || 'generic',
          totalSegments: segments.length,
          totalDuration: `${Math.round(analysis.duration || analysis.sections.reduce((s: number, sec: Record<string, unknown>) => s + (typeof sec.duration === 'string' ? parseFloat(sec.duration as string) : sec.duration as number), 0))}s`,
        },
        segments,
      }, null, 2));
    } catch (err) {
      return textResult(`Error planning video: ${err instanceof Error ? err.message : String(err)}`);
    }
  },
);

server.tool(
  'export_audio_from_ableton',
  'Export the current Ableton Live session as a WAV file for video generation analysis. Renders the master output to a file.',
  {
    outputPath: z.string().describe('File path to save the exported WAV'),
    startBar: z.number().default(1).describe('Start bar for export'),
    endBar: z.number().optional().describe('End bar for export (omit for full song)'),
  },
  async ({ outputPath, startBar, endBar }) => {
    try {
      let resolvedEndBar = endBar;
      if (!resolvedEndBar) {
        const songInfo = await sendToAbleton({ type: 'get_song_info' }) as Record<string, unknown>;
        resolvedEndBar = (songInfo.song_length as number) || 64;
      }

      await sendToAbleton({
        type: 'export_audio',
        params: {
          output_path: outputPath,
          start_bar: startBar,
          end_bar: resolvedEndBar,
        },
      });

      return textResult(
        `Audio exported to ${outputPath} (bars ${startBar}-${resolvedEndBar}). ` +
        `Ready for analyze_song_structure.`,
      );
    } catch (err) {
      return textResult(`Ableton export error: ${err instanceof Error ? err.message : String(err)}`);
    }
  },
);

// ── Start server ─────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Hum-to-MIDI MCP server v1.2.0 running on stdio (with video generation)');
}

main().catch(console.error);

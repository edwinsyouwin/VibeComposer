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

// ── Start server ─────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Hum-to-MIDI MCP server v1.1.0 running on stdio');
}

main().catch(console.error);

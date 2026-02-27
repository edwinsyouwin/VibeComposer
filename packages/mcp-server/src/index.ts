import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || '',
);

const server = new McpServer({
  name: 'hum-to-midi',
  version: '1.0.0',
});

// Tool: Get current session state
server.tool(
  'get_session',
  'Retrieve a composition session and its notes',
  { sessionId: z.string().uuid() },
  async ({ sessionId }) => {
    const [{ data: session, error: sessionErr }, { data: notes, error: notesErr }] =
      await Promise.all([
        supabase.from('sessions').select('*').eq('id', sessionId).single(),
        supabase.from('notes').select('*').eq('session_id', sessionId).order('start_beat'),
      ]);

    if (sessionErr) {
      return { content: [{ type: 'text' as const, text: `Error: ${sessionErr.message}` }] };
    }

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({ session, notes: notes || [] }, null, 2),
        },
      ],
    };
  },
);

// Tool: Add notes programmatically
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

    if (error) {
      return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }] };
    }

    return { content: [{ type: 'text' as const, text: `Added ${notes.length} notes` }] };
  },
);

// Tool: Clear all notes in a session
server.tool(
  'clear_notes',
  'Remove all notes from a composition session',
  { sessionId: z.string().uuid() },
  async ({ sessionId }) => {
    const { error } = await supabase
      .from('notes')
      .delete()
      .eq('session_id', sessionId);

    if (error) {
      return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }] };
    }

    return { content: [{ type: 'text' as const, text: 'Notes cleared' }] };
  },
);

// Tool: Set session parameters
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

    const { error } = await supabase
      .from('sessions')
      .update(updateData)
      .eq('id', sessionId);

    if (error) {
      return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }] };
    }

    return { content: [{ type: 'text' as const, text: 'Session updated' }] };
  },
);

// Tool: Export MIDI data as JSON (for programmatic use)
server.tool(
  'export_midi',
  'Export session notes as MIDI-compatible JSON data',
  { sessionId: z.string().uuid() },
  async ({ sessionId }) => {
    const [{ data: session }, { data: notes }] = await Promise.all([
      supabase.from('sessions').select('*').eq('id', sessionId).single(),
      supabase.from('notes').select('*').eq('session_id', sessionId).order('start_beat'),
    ]);

    if (!session) {
      return { content: [{ type: 'text' as const, text: 'Session not found' }] };
    }

    const midiData = {
      bpm: session.bpm,
      key: session.key,
      scale: session.scale,
      notes: (notes || []).map(
        (n: {
          midi_note: number;
          start_beat: number;
          duration_beats: number;
          velocity: number;
          track: number;
        }) => ({
          midiNote: n.midi_note,
          startBeat: Number(n.start_beat),
          durationBeats: Number(n.duration_beats),
          velocity: n.velocity,
          track: n.track,
        }),
      ),
    };

    return {
      content: [{ type: 'text' as const, text: JSON.stringify(midiData, null, 2) }],
    };
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Hum-to-MIDI MCP server running on stdio');
}

main().catch(console.error);

import { supabase } from './client';
import type { QuantizedNote } from '@/types/audio';

export async function createSession(userId: string) {
  const { data, error } = await supabase
    .from('sessions')
    .insert({ user_id: userId })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateSession(
  sessionId: string,
  params: { bpm?: number; key?: string; scale?: string; name?: string },
) {
  const { error } = await supabase
    .from('sessions')
    .update({ ...params, updated_at: new Date().toISOString() })
    .eq('id', sessionId);
  if (error) throw error;
}

export async function saveNotes(sessionId: string, notes: QuantizedNote[]) {
  await supabase.from('notes').delete().eq('session_id', sessionId);
  if (notes.length === 0) return;
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
  if (error) throw error;
}

export async function loadSession(sessionId: string) {
  const [{ data: session }, { data: notes }] = await Promise.all([
    supabase.from('sessions').select('*').eq('id', sessionId).single(),
    supabase
      .from('notes')
      .select('*')
      .eq('session_id', sessionId)
      .order('start_beat'),
  ]);

  return {
    session,
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
}

export async function deleteSession(sessionId: string) {
  const { error } = await supabase
    .from('sessions')
    .delete()
    .eq('id', sessionId);
  if (error) throw error;
}

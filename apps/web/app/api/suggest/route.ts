import { NextRequest } from 'next/server';

export async function POST(req: NextRequest) {
  const { notes, key, scale, prompt } = await req.json();

  const systemPrompt = `You are a music composition assistant.
The user has hummed a melody. You receive it as quantized MIDI notes.
Each note has: midiNote (0-127), startBeat, durationBeats, velocity.
Middle C = MIDI 60. One octave = 12 semitones.
The session key is ${key} ${scale}.
Return ONLY valid JSON with a "notes" array in the same format.`;

  const userMessage = `Current melody: ${JSON.stringify(notes)}
Request: ${prompt}`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY || '',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      }),
    });

    if (!response.ok) {
      return Response.json(
        { error: `API error: ${response.status}` },
        { status: response.status },
      );
    }

    const data = await response.json();
    const text =
      data.content?.[0]?.type === 'text' ? data.content[0].text : '';

    try {
      const parsed = JSON.parse(text);
      return Response.json(parsed);
    } catch {
      return Response.json(
        { error: 'Failed to parse suggestion', raw: text },
        { status: 500 },
      );
    }
  } catch (err) {
    return Response.json(
      { error: `Request failed: ${err instanceof Error ? err.message : 'unknown'}` },
      { status: 500 },
    );
  }
}

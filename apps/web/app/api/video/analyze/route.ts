import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/video/analyze
 * Accepts an audio file upload and returns song structure analysis.
 *
 * For a production deployment, this would call the Python analysis script.
 * In development, it can accept pre-computed analysis JSON.
 */
export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get('content-type') || '';

    if (contentType.includes('multipart/form-data')) {
      // File upload path
      const formData = await request.formData();
      const file = formData.get('audio') as File;

      if (!file) {
        return NextResponse.json(
          { error: 'No audio file provided' },
          { status: 400 },
        );
      }

      // In production: save file, run Python analysis, return results.
      // For now, generate a mock analysis from the file metadata.
      const buffer = Buffer.from(await file.arrayBuffer());
      const analysis = generateMockAnalysis(file.name, buffer.length);

      return NextResponse.json(analysis);
    }

    if (contentType.includes('application/json')) {
      // Accept pre-computed analysis
      const body = await request.json();
      if (body.analysis) {
        return NextResponse.json(body.analysis);
      }
    }

    return NextResponse.json(
      { error: 'Invalid request. Send multipart/form-data with audio file or JSON with analysis.' },
      { status: 400 },
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Analysis failed' },
      { status: 500 },
    );
  }
}

/**
 * Generate a mock analysis for development/demo purposes.
 * In production, this is replaced by the Python librosa pipeline.
 */
function generateMockAnalysis(filename: string, fileSize: number) {
  // Estimate duration from file size (rough: 44.1kHz, 16-bit, stereo ≈ 176KB/s)
  const estimatedDuration = Math.max(60, Math.min(300, fileSize / 176000));
  const bpm = 128;
  const secondsPerBeat = 60 / bpm;
  const totalBeats = Math.floor(estimatedDuration / secondsPerBeat);

  // Generate beat grid
  const beats = Array.from({ length: totalBeats }, (_, i) => ({
    time: Number((i * secondsPerBeat).toFixed(4)),
    beatInBar: (i % 4) + 1,
    isDownbeat: i % 4 === 0,
    energy: Math.min(1, 0.3 + 0.4 * Math.sin((i / totalBeats) * Math.PI * 4) + Math.random() * 0.2),
  }));

  // Generate sections (realistic EDM structure)
  const sections = [
    { type: 'intro', bars: 8 },
    { type: 'build', bars: 4 },
    { type: 'drop', bars: 16 },
    { type: 'breakdown', bars: 8 },
    { type: 'build', bars: 4 },
    { type: 'drop', bars: 16 },
    { type: 'breakdown', bars: 8 },
    { type: 'outro', bars: 8 },
  ];

  const energyMap: Record<string, number> = {
    intro: 0.25,
    build: 0.55,
    drop: 0.9,
    breakdown: 0.2,
    outro: 0.15,
  };

  let currentTime = 0;
  let currentBar = 1;
  const analyzedSections = sections.map((s, i) => {
    const duration = s.bars * 4 * secondsPerBeat;
    const section = {
      id: `s${i}`,
      type: s.type,
      startTime: Number(currentTime.toFixed(3)),
      endTime: Number((currentTime + duration).toFixed(3)),
      duration: Number(duration.toFixed(3)),
      startBar: currentBar,
      endBar: currentBar + s.bars - 1,
      energy: energyMap[s.type] || 0.5,
    };
    currentTime += duration;
    currentBar += s.bars;
    return section;
  });

  // Generate transitions
  const transitions = analyzedSections.slice(0, -1).map((section, i) => {
    const next = analyzedSections[i + 1];
    const delta = next.energy - section.energy;
    return {
      id: `t${i}`,
      fromSection: section.id,
      toSection: next.id,
      time: section.endTime,
      type: Math.abs(delta) > 0.4 ? (delta > 0 ? 'cut' : 'silence')
        : delta > 0 ? 'riser' : 'fade',
      intensity: Math.min(Math.abs(delta) * 2, 1),
    };
  });

  // Energy curve
  const energyCurve: [number, number][] = [];
  for (let t = 0; t < currentTime; t += 0.5) {
    const section = analyzedSections.find(s => t >= s.startTime && t < s.endTime);
    const energy = section ? section.energy + (Math.random() - 0.5) * 0.1 : 0.3;
    energyCurve.push([t, Math.max(0, Math.min(1, energy))]);
  }

  return {
    audioSource: filename,
    bpm,
    key: 'Am',
    duration: Number(currentTime.toFixed(3)),
    timeSignature: '4/4',
    beats,
    sections: analyzedSections,
    transitions,
    energyCurve,
    spectralProfile: {
      dominantBands: Object.fromEntries(analyzedSections.map(s => [s.id, s.type === 'drop' ? 'sub' : 'mid'])),
      brightness: 0.45,
      warmth: 0.55,
    },
  };
}

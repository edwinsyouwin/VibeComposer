import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/video/generate
 * Handles video planning (prompt generation) and video clip generation.
 *
 * Actions:
 * - "plan": Generate video prompts from song analysis
 * - "generate": Submit clips to video generation provider
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;

    if (action === 'plan') {
      return handlePlan(body);
    }

    if (action === 'generate') {
      return handleGenerate(body);
    }

    return NextResponse.json(
      { error: 'Invalid action. Use "plan" or "generate".' },
      { status: 400 },
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Request failed' },
      { status: 500 },
    );
  }
}

// ── Section style & genre world mappings ────────────────────────────

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

const DEFAULT_WORLD = {
  world: 'abstract digital landscape with flowing light',
  colorPalette: 'electric blue, deep purple, white, silver',
  keywords: ['abstract', 'digital', 'light'],
};

function handlePlan(body: {
  analysis: { sections: Array<{ id: string; type: string; startTime: number; duration: number; energy: number }>; transitions?: Array<{ fromSection: string; type: string }>; duration?: number };
  narrativeTheme: string;
  genre?: string;
}) {
  const { analysis, narrativeTheme, genre } = body;
  const genreWorld = genre && GENRE_WORLDS[genre] ? GENRE_WORLDS[genre] : DEFAULT_WORLD;
  const maxClipDuration = 10;

  const segments = [];

  for (let i = 0; i < analysis.sections.length; i++) {
    const section = analysis.sections[i];
    const defaults = SECTION_STYLES[section.type] || SECTION_STYLES.verse;
    const transition = analysis.transitions?.find(t => t.fromSection === section.id);

    const clipCount = Math.ceil(section.duration / maxClipDuration);

    for (let c = 0; c < clipCount; c++) {
      const clipStart = section.startTime + (c * section.duration / clipCount);
      const clipDuration = Math.min(section.duration / clipCount, maxClipDuration);
      const arcPosition = i / Math.max(analysis.sections.length - 1, 1);
      const narrativePhase = arcPosition < 0.2 ? 'opening'
        : arcPosition < 0.5 ? 'rising action'
        : arcPosition < 0.75 ? 'climax' : 'resolution';

      const energyDesc = section.energy > 0.7 ? 'explosive, maximum intensity'
        : section.energy > 0.4 ? 'moderate energy, flowing motion'
        : 'calm, gentle movement';

      const prompt = [
        `Cinematic ${defaults.aesthetic}.`,
        `Theme: ${narrativeTheme}, ${narrativePhase} moment in ${genreWorld.world}.`,
        `Color palette: ${genreWorld.colorPalette}.`,
        `Camera: ${defaults.cameraStyle}.`,
        `Energy: ${energyDesc}.`,
        `Style: ${[...defaults.keywords, ...genreWorld.keywords].join(', ')}.`,
        `Motion intensity: ${Math.round(defaults.motionIntensity * 100)}%.`,
        'Cinematic quality, 24fps filmic motion, professional color grading.',
      ].join(' ');

      segments.push({
        id: `seg-${section.id}-${c}`,
        sectionId: section.id,
        sectionType: section.type,
        startTime: Math.round(clipStart * 1000) / 1000,
        duration: Math.round(clipDuration * 1000) / 1000,
        prompt,
        outTransition: c === clipCount - 1 && transition ? transition.type : null,
        status: 'pending' as const,
      });
    }
  }

  return NextResponse.json({ segments });
}

async function handleGenerate(body: {
  segments: Array<{ id: string; prompt: string; duration: number; status: string }>;
  provider: string;
  apiKey: string;
  resolution: string;
  aspectRatio: string;
}) {
  const { segments, provider, apiKey, resolution, aspectRatio } = body;

  if (!apiKey) {
    return NextResponse.json({ error: 'API key required' }, { status: 400 });
  }

  // Determine provider base URL
  const providerUrls: Record<string, string> = {
    seedance: 'https://api.seedance.ai/v2',
    runway: 'https://api.dev.runwayml.com/v1',
    kling: 'https://api.wavespeed.ai/v1/kling',
  };

  const baseUrl = providerUrls[provider];
  if (!baseUrl) {
    return NextResponse.json({ error: `Unknown provider: ${provider}` }, { status: 400 });
  }

  // Generate all clips (in production, this would be async with status polling)
  const results = [];

  for (const segment of segments) {
    try {
      const response = await submitToProvider(baseUrl, provider, apiKey, {
        prompt: segment.prompt,
        duration: Math.min(segment.duration, 10),
        resolution,
        aspectRatio,
      });

      results.push({
        ...segment,
        status: 'completed' as const,
        clipUrl: response.clipUrl,
        jobId: response.id,
      });
    } catch (err) {
      results.push({
        ...segment,
        status: 'failed' as const,
        error: err instanceof Error ? err.message : 'Generation failed',
      });
    }
  }

  return NextResponse.json({ segments: results });
}

async function submitToProvider(
  baseUrl: string,
  provider: string,
  apiKey: string,
  request: { prompt: string; duration: number; resolution: string; aspectRatio: string },
): Promise<{ id: string; clipUrl?: string }> {
  // Format request based on provider
  let endpoint: string;
  let body: Record<string, unknown>;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`,
  };

  switch (provider) {
    case 'seedance':
      endpoint = `${baseUrl}/text-to-video`;
      body = {
        prompt: request.prompt,
        duration: request.duration,
        resolution: request.resolution,
        aspect_ratio: request.aspectRatio,
      };
      break;

    case 'runway':
      endpoint = `${baseUrl}/image_to_video`;
      headers['X-Runway-Version'] = '2024-11-06';
      body = {
        promptText: request.prompt,
        duration: request.duration,
        ratio: request.aspectRatio === '16:9' ? '1280:768' : '768:1280',
      };
      break;

    case 'kling':
      endpoint = `${baseUrl}/generate`;
      body = {
        prompt: request.prompt,
        duration: request.duration,
        resolution: request.resolution,
        aspect_ratio: request.aspectRatio,
      };
      break;

    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`${provider} API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();

  // Return normalized response
  return {
    id: data.id || data.task_id,
    clipUrl: data.video_url || data.output?.[0],
  };
}

import type {
  PromptContext,
  SongSection,
  SectionType,
  VisualStyle,
  SongAnalysis,
  VideoSegment,
  SECTION_VISUAL_DEFAULTS,
} from '../types.js';

/**
 * Genre-to-visual-world mappings for EDM subgenres.
 * These set the baseline visual aesthetic for the entire video.
 */
const GENRE_VISUAL_WORLDS: Record<string, {
  world: string;
  colorPalette: string;
  keywords: string[];
}> = {
  'melodic-techno': {
    world: 'vast desert landscapes and futuristic architecture bathed in golden hour light',
    colorPalette: 'amber, deep blue, warm white, bronze',
    keywords: ['architectural', 'geometric', 'vast scale', 'solitary figure'],
  },
  'afro-tech': {
    world: 'vibrant African-futurism city with organic technology and lush vegetation',
    colorPalette: 'earth tones, gold, emerald green, sunset orange',
    keywords: ['organic', 'rhythmic patterns', 'cultural motifs', 'warm light'],
  },
  'jersey-club': {
    world: 'neon-lit urban nightscape with dance floor energy and street culture',
    colorPalette: 'electric purple, hot pink, chrome, black',
    keywords: ['urban', 'dance', 'dynamic', 'street-level', 'bounce'],
  },
  'space-bass': {
    world: 'deep space nebulae and alien crystalline structures with bioluminescence',
    colorPalette: 'deep purple, cyan, magenta, void black',
    keywords: ['cosmic', 'alien', 'liquid', 'distortion', 'fractal'],
  },
  'pop-edm': {
    world: 'glossy festival stage with LED walls, confetti, and euphoric crowd energy',
    colorPalette: 'rainbow spectrum, white, gold sparkle',
    keywords: ['festival', 'euphoric', 'crowd', 'lights', 'celebration'],
  },
};

const DEFAULT_WORLD = {
  world: 'abstract digital landscape with flowing light and geometric forms',
  colorPalette: 'electric blue, deep purple, white, silver',
  keywords: ['abstract', 'digital', 'light', 'motion'],
};

/**
 * Build a visual style for a song section by merging:
 * 1. Section-type defaults (from SECTION_VISUAL_DEFAULTS)
 * 2. Genre-specific world
 * 3. User-provided overrides
 */
export function buildSectionStyle(
  section: SongSection,
  genre?: string,
  userOverrides?: Partial<VisualStyle>,
): VisualStyle {
  const sectionDefaults: Record<SectionType, Partial<VisualStyle>> = {
    intro: {
      aesthetic: 'ethereal establishing shot',
      cameraStyle: 'slow dolly in',
      motionIntensity: 0.2,
      keywords: ['atmospheric', 'ambient', 'wide angle', 'cinematic fog'],
    },
    verse: {
      aesthetic: 'intimate narrative moment',
      cameraStyle: 'steady medium shot',
      motionIntensity: 0.4,
      keywords: ['storytelling', 'character focus', 'natural lighting'],
    },
    chorus: {
      aesthetic: 'vibrant high-energy spectacle',
      cameraStyle: 'dynamic tracking shot',
      motionIntensity: 0.8,
      keywords: ['vivid colors', 'dramatic lighting', 'wide angle'],
    },
    build: {
      aesthetic: 'accelerating tension',
      cameraStyle: 'push in with increasing speed',
      motionIntensity: 0.6,
      keywords: ['rising energy', 'particle effects', 'light rays', 'anticipation'],
    },
    drop: {
      aesthetic: 'explosive maximum energy',
      cameraStyle: 'rapid cuts and camera shake',
      motionIntensity: 1.0,
      keywords: ['intense', 'strobe lighting', 'bass-heavy visuals', 'impact'],
    },
    breakdown: {
      aesthetic: 'spacious atmospheric calm',
      cameraStyle: 'slow orbit or crane shot',
      motionIntensity: 0.15,
      keywords: ['dreamy', 'reverb-visual', 'soft focus', 'space'],
    },
    bridge: {
      aesthetic: 'transitional transformation',
      cameraStyle: 'whip pan or morph',
      motionIntensity: 0.5,
      keywords: ['color shift', 'perspective change', 'metamorphosis'],
    },
    outro: {
      aesthetic: 'fading resolution',
      cameraStyle: 'slow pull back',
      motionIntensity: 0.1,
      keywords: ['fade', 'dissolve', 'peaceful', 'closing'],
    },
  };

  const defaults = sectionDefaults[section.type] || sectionDefaults.verse;
  const genreWorld = genre ? GENRE_VISUAL_WORLDS[genre] || DEFAULT_WORLD : DEFAULT_WORLD;

  return {
    name: `${section.type}-${section.id}`,
    aesthetic: userOverrides?.aesthetic || defaults.aesthetic || '',
    colorPalette: userOverrides?.colorPalette || genreWorld.colorPalette,
    cameraStyle: userOverrides?.cameraStyle || defaults.cameraStyle || '',
    motionIntensity: userOverrides?.motionIntensity ?? defaults.motionIntensity ?? section.energy,
    keywords: [
      ...(defaults.keywords || []),
      ...(genreWorld.keywords || []),
      ...(userOverrides?.keywords || []),
    ],
  };
}

/**
 * Generate a video generation prompt for a song section.
 * The prompt is designed for text-to-video models like Seedance/Runway.
 */
export function generateSectionPrompt(ctx: PromptContext): string {
  const { section, transition, style, narrativeTheme, sectionIndex, totalSections } = ctx;

  // Narrative arc position
  const arcPosition = sectionIndex / Math.max(totalSections - 1, 1);
  const narrativePhase = arcPosition < 0.2 ? 'opening'
    : arcPosition < 0.5 ? 'rising action'
    : arcPosition < 0.75 ? 'climax'
    : 'resolution';

  // Build the prompt
  const parts: string[] = [];

  // Scene description
  parts.push(`Cinematic ${style.aesthetic}.`);

  // Narrative context
  if (narrativeTheme) {
    parts.push(`Theme: ${narrativeTheme}, ${narrativePhase} moment.`);
  }

  // Visual details
  parts.push(`Color palette: ${style.colorPalette}.`);
  parts.push(`Camera: ${style.cameraStyle}.`);

  // Energy mapping
  const energyDescriptor = section.energy > 0.8 ? 'explosive, maximum intensity'
    : section.energy > 0.6 ? 'high energy, dynamic movement'
    : section.energy > 0.4 ? 'moderate energy, flowing motion'
    : section.energy > 0.2 ? 'calm, gentle movement'
    : 'still, meditative, minimal motion';
  parts.push(`Energy: ${energyDescriptor}.`);

  // Transition handling
  if (transition) {
    const transitionDesc: Record<string, string> = {
      cut: 'End with a dramatic impact moment, freeze-frame energy',
      riser: 'Build visual intensity throughout, accelerating motion toward the end',
      fade: 'Gradually dissolve visual elements, decreasing intensity',
      filter: 'Shift colors and focus as if a filter is sweeping across',
      silence: 'End with a moment of visual silence, darkness or empty space',
      crossfade: 'Maintain visual continuity, elements slowly morphing',
    };
    parts.push(transitionDesc[transition.type] || '');
  }

  // Style keywords
  if (style.keywords.length > 0) {
    parts.push(`Style: ${style.keywords.join(', ')}.`);
  }

  // Motion intensity
  parts.push(`Motion intensity: ${Math.round(style.motionIntensity * 100)}%.`);

  // Continuity with previous segment
  if (ctx.previousPrompt) {
    parts.push('Maintain visual continuity with the previous scene.');
  }

  // Quality markers
  parts.push('Cinematic quality, 24fps filmic motion, professional color grading.');

  return parts.filter(Boolean).join(' ');
}

/**
 * Generate all video segment definitions for a complete song analysis.
 * This is the main orchestration function that plans the entire video.
 */
export function planVideoSegments(
  analysis: SongAnalysis,
  narrativeTheme: string,
  genre?: string,
  styleOverrides?: Record<string, Partial<VisualStyle>>,
): VideoSegment[] {
  const segments: VideoSegment[] = [];

  for (let i = 0; i < analysis.sections.length; i++) {
    const section = analysis.sections[i];
    const transition = analysis.transitions.find(t => t.fromSection === section.id);
    const style = buildSectionStyle(
      section,
      genre,
      styleOverrides?.[section.id],
    );

    // Split long sections into multiple clips (max ~10s per generation)
    const maxClipDuration = 10;
    const clipCount = Math.ceil(section.duration / maxClipDuration);

    for (let c = 0; c < clipCount; c++) {
      const clipStart = section.startTime + (c * section.duration / clipCount);
      const clipDuration = Math.min(section.duration / clipCount, maxClipDuration);

      const isLastClipInSection = c === clipCount - 1;
      const previousSegment = segments[segments.length - 1];

      const ctx: PromptContext = {
        section,
        transition: isLastClipInSection ? transition : undefined,
        style,
        narrativeTheme,
        previousPrompt: previousSegment?.prompt,
        sectionIndex: i,
        totalSections: analysis.sections.length,
      };

      const transitionMap: Record<string, { type: 'cut' | 'crossfade' | 'flash' | 'zoom' | 'glitch' | 'wipe'; duration: number }> = {
        cut: { type: 'cut', duration: 0 },
        riser: { type: 'zoom', duration: 0.5 },
        fade: { type: 'crossfade', duration: 1.5 },
        filter: { type: 'wipe', duration: 1.0 },
        silence: { type: 'flash', duration: 0.3 },
        crossfade: { type: 'crossfade', duration: 2.0 },
      };

      segments.push({
        id: `seg-${section.id}-${c}`,
        sectionId: section.id,
        startTime: clipStart,
        duration: clipDuration,
        prompt: generateSectionPrompt(ctx),
        style,
        status: 'pending',
        outTransition: isLastClipInSection && transition
          ? transitionMap[transition.type] || { type: 'cut', duration: 0 }
          : undefined,
      });
    }
  }

  return segments;
}

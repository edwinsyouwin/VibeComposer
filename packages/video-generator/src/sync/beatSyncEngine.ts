import type { Beat, SongAnalysis, VideoSegment, VideoTransition } from '../types.js';

/**
 * Beat-sync engine: aligns video cuts, transitions, and effects
 * to musical beat positions for tight audio-visual synchronization.
 */

export interface BeatSyncPlan {
  /** Segments with adjusted start/end times snapped to beats */
  segments: VideoSegment[];
  /** Beat-aligned cut points (timestamps in seconds) */
  cutPoints: number[];
  /** Effect triggers aligned to beats */
  effectTriggers: EffectTrigger[];
}

export interface EffectTrigger {
  time: number;
  type: 'flash' | 'zoom_pulse' | 'color_shift' | 'glitch' | 'particle_burst';
  intensity: number;
  /** Which beat level triggered this */
  beatLevel: 'downbeat' | 'beat' | 'offbeat';
}

/**
 * Snap a timestamp to the nearest beat in the grid.
 */
export function snapToNearestBeat(time: number, beats: Beat[]): Beat {
  let closest = beats[0];
  let minDist = Math.abs(time - closest.time);

  for (const beat of beats) {
    const dist = Math.abs(time - beat.time);
    if (dist < minDist) {
      minDist = dist;
      closest = beat;
    }
  }

  return closest;
}

/**
 * Snap a timestamp to the nearest downbeat.
 */
export function snapToNearestDownbeat(time: number, beats: Beat[]): Beat {
  const downbeats = beats.filter(b => b.isDownbeat);
  return snapToNearestBeat(time, downbeats.length > 0 ? downbeats : beats);
}

/**
 * Create a complete beat-sync plan from analysis and video segments.
 * Adjusts segment boundaries to land on beats for tight sync.
 */
export function createBeatSyncPlan(
  analysis: SongAnalysis,
  segments: VideoSegment[],
): BeatSyncPlan {
  const { beats } = analysis;
  const syncedSegments: VideoSegment[] = [];
  const cutPoints: number[] = [];
  const effectTriggers: EffectTrigger[] = [];

  for (let i = 0; i < segments.length; i++) {
    const segment = { ...segments[i] };

    // Snap segment start to nearest downbeat (major visual transition)
    const snappedStart = snapToNearestDownbeat(segment.startTime, beats);
    segment.startTime = snappedStart.time;

    // Snap segment end to nearest beat
    const rawEnd = segments[i].startTime + segments[i].duration;
    const snappedEnd = snapToNearestBeat(rawEnd, beats);
    segment.duration = Math.max(snappedEnd.time - segment.startTime, 1);

    syncedSegments.push(segment);

    // Record cut point at segment boundary
    if (i > 0) {
      cutPoints.push(segment.startTime);
    }

    // Generate effect triggers within this segment
    const sectionBeats = beats.filter(
      b => b.time >= segment.startTime && b.time < segment.startTime + segment.duration,
    );

    for (const beat of sectionBeats) {
      // Downbeats get stronger effects
      if (beat.isDownbeat && beat.energy > 0.6) {
        effectTriggers.push({
          time: beat.time,
          type: beat.energy > 0.8 ? 'flash' : 'zoom_pulse',
          intensity: beat.energy,
          beatLevel: 'downbeat',
        });
      }

      // High-energy beats get subtle effects
      if (!beat.isDownbeat && beat.energy > 0.8) {
        effectTriggers.push({
          time: beat.time,
          type: 'color_shift',
          intensity: beat.energy * 0.5,
          beatLevel: 'beat',
        });
      }
    }
  }

  return { segments: syncedSegments, cutPoints, effectTriggers };
}

/**
 * Generate an FFmpeg filter string for beat-synced visual effects.
 * This creates flash, zoom, and color effects at beat positions.
 */
export function generateBeatSyncFilters(triggers: EffectTrigger[]): string {
  const filters: string[] = [];

  for (const trigger of triggers) {
    const t = trigger.time;
    const dur = 0.08; // Effect duration in seconds

    switch (trigger.type) {
      case 'flash': {
        // Brief brightness flash
        const brightness = 0.1 + trigger.intensity * 0.3;
        filters.push(
          `eq=brightness=${brightness}:enable='between(t,${t},${t + dur})'`,
        );
        break;
      }
      case 'zoom_pulse': {
        // Slight zoom in/out pulse
        const zoom = 1 + trigger.intensity * 0.05;
        filters.push(
          `zoompan=z='if(between(t,${t},${t + dur}),${zoom},1)':d=1:s=1920x1080`,
        );
        break;
      }
      case 'color_shift': {
        // Hue rotation on beat
        const hue = trigger.intensity * 30;
        filters.push(
          `hue=h=${hue}:enable='between(t,${t},${t + dur * 2})'`,
        );
        break;
      }
      case 'glitch': {
        // Displacement effect
        filters.push(
          `rgbashift=rh=${Math.round(trigger.intensity * 5)}:bh=${Math.round(-trigger.intensity * 5)}:enable='between(t,${t},${t + dur})'`,
        );
        break;
      }
    }
  }

  return filters.join(',');
}

/**
 * Map transition types between sections to FFmpeg transition names.
 */
export function getFFmpegTransition(transition: VideoTransition): {
  name: string;
  duration: number;
} {
  const map: Record<string, string> = {
    cut: 'fade',
    crossfade: 'fade',
    flash: 'fadewhite',
    zoom: 'zoomin',
    glitch: 'pixelize',
    wipe: 'wipeleft',
  };

  return {
    name: map[transition.type] || 'fade',
    duration: transition.duration,
  };
}

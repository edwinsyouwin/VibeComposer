"""Single voice: oscillators -> filter -> amp envelope -> stereo output."""

from __future__ import annotations

import numpy as np

from ..models import (
    SynthPatch, NoteEvent, ModDestination, PatchModulation,
)
from ..constants import SAMPLE_RATE
from ..utils import midi_to_freq
from .envelope import generate_adsr
from .oscillator import render_oscillator
from .filter import apply_svf
from .modulation import evaluate_modulation


def render_voice(
    patch: SynthPatch,
    note: NoteEvent,
    mod: PatchModulation,
    sample_rate: int = SAMPLE_RATE,
    wavetable_frames_map: dict[str, list[np.ndarray]] | None = None,
) -> tuple[np.ndarray, int]:
    """Render a single voice (note) through the synth patch.

    Args:
        patch: The synth patch configuration.
        note: The note event to render.
        mod: Modulation routings and LFOs.
        sample_rate: Sample rate.
        wavetable_frames_map: Map of wavetable_id -> list of frames.

    Returns:
        (stereo_audio, total_samples) where stereo_audio is shape (2, total_samples).
    """
    # Calculate frequency
    base_freq = midi_to_freq(
        note.pitch_midi
        + note.pitch_bend * 2.0  # ±2 semitones default range
    )

    note_on_samples = int(note.duration_s * sample_rate)

    # Generate amp envelope
    amp_env = generate_adsr(
        patch.amp_envelope.attack_s,
        patch.amp_envelope.decay_s,
        patch.amp_envelope.sustain,
        patch.amp_envelope.release_s,
        note_on_samples,
        sample_rate,
    )
    total_samples = len(amp_env)

    # Generate filter envelope
    filt_env = generate_adsr(
        patch.filter_envelope.attack_s,
        patch.filter_envelope.decay_s,
        patch.filter_envelope.sustain,
        patch.filter_envelope.release_s,
        note_on_samples,
        sample_rate,
    )
    # Pad or trim to match amp envelope length
    if len(filt_env) < total_samples:
        filt_env = np.pad(filt_env, (0, total_samples - len(filt_env)))
    else:
        filt_env = filt_env[:total_samples]

    # Evaluate modulation matrix
    mod_signals = evaluate_modulation(mod, total_samples, sample_rate, note.velocity)

    # Render each oscillator and sum
    mix = np.zeros((2, total_samples), dtype=np.float64)

    for i, osc in enumerate(patch.oscillators):
        osc_freq = base_freq * (2.0 ** osc.octave) * (2.0 ** (osc.semi / 12.0)) * (2.0 ** (osc.fine / 1200.0))

        # Pitch modulation
        pitch_dest = ModDestination.osc1_pitch if i == 0 else ModDestination.osc2_pitch
        pitch_mod = mod_signals.get(pitch_dest)

        # Wavetable position modulation
        wt_dest = ModDestination.osc1_wt_pos if i == 0 else ModDestination.osc2_wt_pos
        wt_mod = mod_signals.get(wt_dest)
        if wt_mod is not None:
            wt_mod = np.clip(osc.wavetable_position + wt_mod, 0.0, 1.0)

        # Level modulation
        level_dest = ModDestination.osc1_level if i == 0 else ModDestination.osc2_level
        level_mod = mod_signals.get(level_dest)

        # Resolve wavetable frames
        wt_frames = None
        if wavetable_frames_map and osc.wavetable in wavetable_frames_map:
            wt_frames = wavetable_frames_map[osc.wavetable]

        osc_audio = render_oscillator(
            wavetable=osc.wavetable,
            freq=osc_freq,
            num_samples=total_samples,
            level=osc.level,
            pan=osc.pan,
            wavetable_position=osc.wavetable_position,
            wt_pos_mod=wt_mod,
            unison_voices=osc.unison_voices,
            unison_detune=osc.unison_detune,
            sample_rate=sample_rate,
            wavetable_frames=wt_frames,
            pitch_mod=pitch_mod,
        )

        # Apply per-oscillator level modulation
        if level_mod is not None:
            gain = np.clip(1.0 + level_mod, 0.0, 2.0)
            osc_audio[0] *= gain
            osc_audio[1] *= gain

        mix += osc_audio

    # Filter cutoff modulation (from mod matrix + filter envelope)
    cutoff_mod = filt_env * patch.filter_envelope.depth * patch.filter.cutoff_hz
    if ModDestination.filter_cutoff in mod_signals:
        cutoff_mod = cutoff_mod + mod_signals[ModDestination.filter_cutoff] * patch.filter.cutoff_hz

    # Apply filter to each channel independently to preserve stereo image
    stereo = np.zeros((2, total_samples), dtype=np.float64)
    for ch in range(2):
        stereo[ch] = apply_svf(
            mix[ch],
            patch.filter.type,
            patch.filter.cutoff_hz,
            patch.filter.resonance,
            patch.filter.drive,
            cutoff_mod=cutoff_mod,
            sample_rate=sample_rate,
        )

    # Apply amp envelope + velocity
    amp = amp_env * note.velocity
    stereo[0] *= amp
    stereo[1] *= amp

    # Apply amp level modulation
    if ModDestination.amp_level in mod_signals:
        amp_mod = np.clip(1.0 + mod_signals[ModDestination.amp_level], 0.0, 2.0)
        stereo[0] *= amp_mod
        stereo[1] *= amp_mod

    # Pan modulation
    if ModDestination.pan in mod_signals:
        pan_mod = np.clip(mod_signals[ModDestination.pan], -1.0, 1.0)
        l_gain = np.cos((pan_mod + 1.0) * 0.25 * np.pi)
        r_gain = np.sin((pan_mod + 1.0) * 0.25 * np.pi)
        stereo[0] *= l_gain
        stereo[1] *= r_gain

    return stereo.astype(np.float32), total_samples

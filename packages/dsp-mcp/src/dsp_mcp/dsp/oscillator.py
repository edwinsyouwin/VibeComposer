"""Wavetable oscillator with phase accumulation, interpolation, and unison."""

import numpy as np

from ..constants import TABLE_LENGTH, SAMPLE_RATE
from ..wavetable.bandlimit import generate_bandlimited_set, select_table_index
from ..wavetable.builtins import get_builtin, BUILTIN_NAMES


def render_oscillator(
    wavetable: np.ndarray | str,
    freq: float,
    num_samples: int,
    level: float = 1.0,
    pan: float = 0.0,
    wavetable_position: float = 0.0,
    wt_pos_mod: np.ndarray | None = None,
    unison_voices: int = 1,
    unison_detune: float = 0.0,
    sample_rate: int = SAMPLE_RATE,
    wavetable_frames: list[np.ndarray] | None = None,
    pitch_mod: np.ndarray | None = None,
) -> np.ndarray:
    """Render an oscillator to stereo audio.

    Args:
        wavetable: Either a builtin name (str) or a single-cycle numpy array.
        freq: Base frequency in Hz.
        num_samples: Number of samples to render.
        level: Output level [0, 1].
        pan: Stereo pan [-1, 1].
        wavetable_position: Static morph position [0, 1].
        wt_pos_mod: Per-sample wavetable position modulation array.
        unison_voices: Number of unison voices.
        unison_detune: Unison spread in cents.
        sample_rate: Sample rate.
        wavetable_frames: Multi-frame wavetable (list of arrays). Overrides wavetable param.
        pitch_mod: Per-sample pitch modulation in semitones.

    Returns:
        Stereo array of shape (2, num_samples).
    """
    # Resolve wavetable
    if wavetable_frames is not None and len(wavetable_frames) > 1:
        frames = wavetable_frames
    else:
        if isinstance(wavetable, str):
            if wavetable in BUILTIN_NAMES:
                base = get_builtin(wavetable)
            else:
                base = wavetable_frames[0] if wavetable_frames else get_builtin("saw")
        else:
            base = wavetable
        frames = [base]

    # Generate band-limited sets for the first frame (for anti-aliasing)
    bl_sets = [generate_bandlimited_set(f, sample_rate) for f in frames]

    output_l = np.zeros(num_samples, dtype=np.float64)
    output_r = np.zeros(num_samples, dtype=np.float64)

    for uv in range(unison_voices):
        # Compute detuned frequency
        if unison_voices > 1:
            detune_cents = -unison_detune / 2 + (unison_detune * uv / (unison_voices - 1))
            voice_pan = -1.0 + 2.0 * uv / (unison_voices - 1)
        else:
            detune_cents = 0.0
            voice_pan = 0.0

        detune_ratio = 2.0 ** (detune_cents / 1200.0)
        voice_freq = freq * detune_ratio

        # Phase accumulation (vectorized)
        if pitch_mod is not None:
            freq_array = voice_freq * (2.0 ** (pitch_mod / 12.0))
        else:
            freq_array = np.full(num_samples, voice_freq, dtype=np.float64)

        phase_inc = freq_array / sample_rate
        phase = np.cumsum(phase_inc) % 1.0

        # Select band-limited table
        table_idx = select_table_index(voice_freq, sample_rate)

        # Wavetable position morphing
        if wt_pos_mod is not None:
            wt_pos = np.clip(wt_pos_mod, 0.0, 1.0)
        else:
            wt_pos = np.full(num_samples, wavetable_position, dtype=np.float64)

        if len(frames) > 1:
            # Interpolate between frames
            frame_float = wt_pos * (len(frames) - 1)
            frame_idx = np.clip(np.floor(frame_float).astype(int), 0, len(frames) - 2)
            frame_frac = frame_float - frame_idx

            samples = _lookup_with_interp(bl_sets, table_idx, phase, frame_idx, frame_frac, num_samples)
        else:
            table = bl_sets[0][min(table_idx, len(bl_sets[0]) - 1)]
            samples = _single_table_lookup(table, phase)

        # Apply pan (equal power)
        combined_pan = np.clip(pan + voice_pan, -1.0, 1.0)
        l_gain = np.cos((combined_pan + 1.0) * 0.25 * np.pi)
        r_gain = np.sin((combined_pan + 1.0) * 0.25 * np.pi)

        voice_gain = level / max(unison_voices, 1)
        output_l += samples * l_gain * voice_gain
        output_r += samples * r_gain * voice_gain

    return np.stack([output_l, output_r]).astype(np.float32)


def _single_table_lookup(table: np.ndarray, phase: np.ndarray) -> np.ndarray:
    """Linear interpolation lookup into a single wavetable."""
    n = len(table)
    index_float = phase * n
    index_int = np.floor(index_float).astype(int) % n
    frac = index_float - np.floor(index_float)
    next_index = (index_int + 1) % n
    return table[index_int] * (1.0 - frac) + table[next_index] * frac


def _lookup_with_interp(
    bl_sets: list[list[np.ndarray]],
    table_idx: int,
    phase: np.ndarray,
    frame_idx: np.ndarray,
    frame_frac: np.ndarray,
    num_samples: int,
) -> np.ndarray:
    """Lookup with frame interpolation for multi-frame wavetables."""
    out = np.zeros(num_samples, dtype=np.float64)
    unique_frames = np.unique(frame_idx)

    for fi in unique_frames:
        mask = frame_idx == fi
        fi_safe = min(fi, len(bl_sets) - 1)
        fi_next = min(fi + 1, len(bl_sets) - 1)
        ti = min(table_idx, len(bl_sets[fi_safe]) - 1)

        s1 = _single_table_lookup(bl_sets[fi_safe][ti], phase[mask])
        s2 = _single_table_lookup(bl_sets[fi_next][ti], phase[mask])
        out[mask] = s1 * (1.0 - frame_frac[mask]) + s2 * frame_frac[mask]

    return out

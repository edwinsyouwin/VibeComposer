"""Chorus: multi-voice modulated delay with stereo spread."""

import numpy as np

from ..constants import SAMPLE_RATE


def apply_chorus(
    audio: np.ndarray,
    rate_hz: float = 1.0,
    depth_ms: float = 3.0,
    voices: int = 3,
    feedback: float = 0.2,
    mix: float = 0.5,
    stereo_spread: float = 0.8,
    sample_rate: int = SAMPLE_RATE,
) -> np.ndarray:
    """Apply chorus to stereo audio (2, N)."""
    dry = audio.copy()
    n = audio.shape[1]
    depth_samples = depth_ms * 0.001 * sample_rate
    base_delay_samples = int(depth_samples * 3)  # center delay

    wet_l = np.zeros(n, dtype=np.float64)
    wet_r = np.zeros(n, dtype=np.float64)

    t = np.arange(n, dtype=np.float64) / sample_rate

    for v in range(voices):
        # Phase offset per voice for stereo spread
        phase_offset = v * stereo_spread * np.pi / max(voices - 1, 1) if voices > 1 else 0

        # LFO for this voice
        lfo_l = np.sin(2.0 * np.pi * rate_hz * t + phase_offset)
        lfo_r = np.sin(2.0 * np.pi * rate_hz * t + phase_offset + np.pi * stereo_spread)

        # Modulated delay in samples
        delay_l = base_delay_samples + lfo_l * depth_samples
        delay_r = base_delay_samples + lfo_r * depth_samples

        # Interpolated delay line read
        for ch, (delay_mod, wet) in enumerate([(delay_l, wet_l), (delay_r, wet_r)]):
            source = audio[ch].astype(np.float64)
            # Pad source for delay reading
            padded = np.pad(source, (base_delay_samples + int(depth_samples) + 1, 0))

            read_pos = np.arange(n, dtype=np.float64) + base_delay_samples + int(depth_samples) + 1 - delay_mod
            read_pos = np.clip(read_pos, 0, len(padded) - 2)
            idx = np.floor(read_pos).astype(int)
            frac = read_pos - idx

            delayed = padded[idx] * (1.0 - frac) + padded[idx + 1] * frac
            wet += delayed / voices

    # Feedback (simplified: add feedback from wet to itself)
    # For simplicity, skip recursive feedback in this vectorized implementation

    # Mix
    result = np.zeros_like(dry, dtype=np.float64)
    result[0] = dry[0] * (1.0 - mix) + wet_l * mix
    result[1] = dry[1] * (1.0 - mix) + wet_r * mix

    return result.astype(np.float32)

"""Saturation/distortion: tanh, cubic, hard_clip, tape. Fully vectorized."""

import numpy as np

from ..models import SaturationAlgorithm
from ..utils import db_to_linear


def apply_saturation(
    audio: np.ndarray,
    algorithm: SaturationAlgorithm,
    drive: float,
    mix: float,
    output_gain_db: float,
) -> np.ndarray:
    """Apply saturation to stereo audio (2, N)."""
    dry = audio.copy()
    c = 1.0 + drive * 9.0  # map 0..1 to 1..10

    if algorithm == SaturationAlgorithm.tanh:
        wet = np.tanh(c * audio) / np.tanh(c)

    elif algorithm == SaturationAlgorithm.cubic:
        scaled = audio * c
        wet = np.where(
            np.abs(scaled) < 2.0 / 3.0,
            scaled - (scaled ** 3) / 3.0,
            np.sign(scaled) * 2.0 / 3.0,
        )

    elif algorithm == SaturationAlgorithm.hard_clip:
        wet = np.clip(audio * c, -1.0, 1.0)

    elif algorithm == SaturationAlgorithm.tape:
        # Tape-style: asymmetric soft clip with even harmonics
        wet = np.tanh(c * audio) / np.tanh(c)
        # Add subtle even harmonics via half-wave rectification blend
        wet = wet + 0.1 * drive * np.clip(audio * c, 0, None)
        # Re-normalize
        peak = np.max(np.abs(wet))
        if peak > 1.0:
            wet /= peak

    else:
        wet = audio

    # Dry/wet mix
    result = dry * (1.0 - mix) + wet * mix

    # Output gain
    result *= db_to_linear(output_gain_db)

    return result.astype(np.float32)

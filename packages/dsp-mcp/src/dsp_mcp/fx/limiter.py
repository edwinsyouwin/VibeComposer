"""Lookahead brickwall limiter."""

import numpy as np
from scipy.ndimage import maximum_filter1d

from ..constants import SAMPLE_RATE
from ..utils import db_to_linear


def apply_limiter(
    audio: np.ndarray,
    ceiling_db: float = -1.0,
    release_ms: float = 50.0,
    lookahead_ms: float = 5.0,
    sample_rate: int = SAMPLE_RATE,
) -> np.ndarray:
    """Apply a brickwall limiter to stereo audio (2, N)."""
    ceiling_linear = db_to_linear(ceiling_db)

    # Peak detection across both channels
    peak = np.max(np.abs(audio), axis=0)

    # Lookahead: find the maximum in a forward window
    lookahead_samples = max(int(lookahead_ms * 0.001 * sample_rate), 1)
    # maximum_filter1d looks both directions; we shift to make it lookahead
    peak_ahead = maximum_filter1d(peak, size=lookahead_samples * 2 + 1)

    # Compute gain reduction
    gain = np.where(
        peak_ahead > ceiling_linear,
        ceiling_linear / (peak_ahead + 1e-10),
        1.0,
    )

    # Smooth the gain envelope (release)
    release_coeff = np.exp(-1.0 / (release_ms * 0.001 * sample_rate))
    smoothed = np.zeros_like(gain)
    g = 1.0
    for i in range(len(gain)):
        if gain[i] < g:
            g = float(gain[i])  # instant attack
        else:
            g = float(gain[i]) + release_coeff * (g - float(gain[i]))
        smoothed[i] = g

    # Delay input by lookahead to align with gain reduction
    result = audio.copy().astype(np.float64)
    if lookahead_samples > 0:
        result = np.pad(result, ((0, 0), (0, lookahead_samples)), mode='constant')[:, lookahead_samples:]

    result[0] *= smoothed
    result[1] *= smoothed

    return result.astype(np.float32)

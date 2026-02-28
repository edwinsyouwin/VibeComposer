"""Parametric EQ using biquad filters via scipy.signal."""

import numpy as np
from scipy.signal import lfilter

from ..models import EQBand, EQBandType
from ..constants import SAMPLE_RATE


def _compute_biquad_coeffs(band: EQBand, sample_rate: int = SAMPLE_RATE) -> tuple[np.ndarray, np.ndarray]:
    """Compute biquad filter coefficients (Audio EQ Cookbook formulas)."""
    A = 10.0 ** (band.gain_db / 40.0)
    w0 = 2.0 * np.pi * band.freq_hz / sample_rate
    cos_w0 = np.cos(w0)
    sin_w0 = np.sin(w0)
    alpha = sin_w0 / (2.0 * band.q)

    if band.type == EQBandType.peak:
        b0 = 1.0 + alpha * A
        b1 = -2.0 * cos_w0
        b2 = 1.0 - alpha * A
        a0 = 1.0 + alpha / A
        a1 = -2.0 * cos_w0
        a2 = 1.0 - alpha / A

    elif band.type == EQBandType.low_shelf:
        sq = 2.0 * np.sqrt(A) * alpha
        b0 = A * ((A + 1) - (A - 1) * cos_w0 + sq)
        b1 = 2.0 * A * ((A - 1) - (A + 1) * cos_w0)
        b2 = A * ((A + 1) - (A - 1) * cos_w0 - sq)
        a0 = (A + 1) + (A - 1) * cos_w0 + sq
        a1 = -2.0 * ((A - 1) + (A + 1) * cos_w0)
        a2 = (A + 1) + (A - 1) * cos_w0 - sq

    elif band.type == EQBandType.high_shelf:
        sq = 2.0 * np.sqrt(A) * alpha
        b0 = A * ((A + 1) + (A - 1) * cos_w0 + sq)
        b1 = -2.0 * A * ((A - 1) + (A + 1) * cos_w0)
        b2 = A * ((A + 1) + (A - 1) * cos_w0 - sq)
        a0 = (A + 1) - (A - 1) * cos_w0 + sq
        a1 = 2.0 * ((A - 1) - (A + 1) * cos_w0)
        a2 = (A + 1) - (A - 1) * cos_w0 - sq

    elif band.type == EQBandType.low_pass:
        b0 = (1.0 - cos_w0) / 2.0
        b1 = 1.0 - cos_w0
        b2 = (1.0 - cos_w0) / 2.0
        a0 = 1.0 + alpha
        a1 = -2.0 * cos_w0
        a2 = 1.0 - alpha

    elif band.type == EQBandType.high_pass:
        b0 = (1.0 + cos_w0) / 2.0
        b1 = -(1.0 + cos_w0)
        b2 = (1.0 + cos_w0) / 2.0
        a0 = 1.0 + alpha
        a1 = -2.0 * cos_w0
        a2 = 1.0 - alpha

    else:
        # passthrough
        return np.array([1.0, 0.0, 0.0]), np.array([1.0, 0.0, 0.0])

    b = np.array([b0 / a0, b1 / a0, b2 / a0])
    a = np.array([1.0, a1 / a0, a2 / a0])
    return b, a


def apply_eq(
    audio: np.ndarray,
    bands: list[EQBand],
    sample_rate: int = SAMPLE_RATE,
) -> np.ndarray:
    """Apply parametric EQ to stereo audio (2, N). Bands are applied in series."""
    result = audio.copy().astype(np.float64)

    for band in bands:
        b, a = _compute_biquad_coeffs(band, sample_rate)
        for ch in range(result.shape[0]):
            result[ch] = lfilter(b, a, result[ch])

    return result.astype(np.float32)

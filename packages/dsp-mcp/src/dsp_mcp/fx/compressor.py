"""RMS envelope compressor with soft knee and makeup gain."""

import numpy as np
from scipy.signal import lfilter

from ..constants import SAMPLE_RATE
from ..utils import db_to_linear


def apply_compressor(
    audio: np.ndarray,
    threshold_db: float,
    ratio: float,
    attack_ms: float,
    release_ms: float,
    knee_db: float = 0.0,
    makeup_db: float = 0.0,
    sidechain: np.ndarray | None = None,
    sample_rate: int = SAMPLE_RATE,
) -> np.ndarray:
    """Apply compression to stereo audio (2, N)."""
    # Envelope detection source
    if sidechain is not None:
        detector = np.max(np.abs(sidechain), axis=0) if sidechain.ndim > 1 else np.abs(sidechain)
    else:
        detector = np.max(np.abs(audio), axis=0)

    # Smooth envelope with one-pole IIR (attack/release)
    attack_coeff = np.exp(-1.0 / (attack_ms * 0.001 * sample_rate))
    release_coeff = np.exp(-1.0 / (release_ms * 0.001 * sample_rate))

    envelope = np.zeros_like(detector)
    env = 0.0
    for i in range(len(detector)):
        inp = float(detector[i])
        if inp > env:
            env = inp + attack_coeff * (env - inp)
        else:
            env = inp + release_coeff * (env - inp)
        envelope[i] = env

    # Convert to dB
    env_db = 20.0 * np.log10(envelope + 1e-10)

    # Gain computation with soft knee
    overshoot = env_db - threshold_db
    gain_reduction_db = np.zeros_like(overshoot)

    if knee_db > 0:
        # Soft knee region
        soft_region = (overshoot > -knee_db / 2) & (overshoot < knee_db / 2)
        hard_region = overshoot >= knee_db / 2

        # Soft knee: quadratic interpolation
        gain_reduction_db[soft_region] = (
            (overshoot[soft_region] + knee_db / 2) ** 2
            / (2.0 * knee_db)
            * (1.0 - 1.0 / ratio)
        )
        gain_reduction_db[hard_region] = overshoot[hard_region] * (1.0 - 1.0 / ratio)
    else:
        above = overshoot > 0
        gain_reduction_db[above] = overshoot[above] * (1.0 - 1.0 / ratio)

    # Apply gain reduction
    gain_linear = 10.0 ** (-gain_reduction_db / 20.0)
    makeup_linear = db_to_linear(makeup_db)

    result = audio.copy().astype(np.float64)
    result[0] *= gain_linear * makeup_linear
    result[1] *= gain_linear * makeup_linear

    return result.astype(np.float32)

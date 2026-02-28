"""Chamberlin State Variable Filter — double-sampled, per-sample loop."""

import numpy as np

from ..models import FilterType
from ..constants import SAMPLE_RATE


def apply_svf(
    audio: np.ndarray,
    filter_type: FilterType,
    cutoff_hz: float,
    resonance: float,
    drive: float = 0.0,
    cutoff_mod: np.ndarray | None = None,
    sample_rate: int = SAMPLE_RATE,
) -> np.ndarray:
    """Apply a state variable filter to mono audio.

    Args:
        audio: 1D input array.
        filter_type: lp, hp, bp, or notch.
        cutoff_hz: Base cutoff frequency.
        resonance: Normalized [0, 1], mapped to Q 0.5–25.
        drive: Pre-filter saturation [0, 1].
        cutoff_mod: Per-sample cutoff modulation in Hz (added to base).
        sample_rate: Sample rate.

    Returns:
        Filtered 1D array.
    """
    n = len(audio)
    output = np.zeros(n, dtype=np.float64)

    # Map resonance 0..1 to Q 0.5..25
    q = 0.5 + resonance * 24.5
    q_inv = 1.0 / q

    # Pre-filter drive
    if drive > 0:
        drive_amount = 1.0 + drive * 9.0
        audio = np.tanh(audio * drive_amount) / np.tanh(drive_amount)

    lp = 0.0
    bp = 0.0
    oversample = 2

    for i in range(n):
        # Modulated cutoff
        if cutoff_mod is not None:
            freq = np.clip(cutoff_hz + cutoff_mod[i], 20.0, 20000.0)
        else:
            freq = cutoff_hz

        f = 2.0 * np.sin(np.pi * freq / (sample_rate * oversample))
        f = min(f, 0.99)  # stability

        inp = float(audio[i])

        # Double-sampled iteration
        for _ in range(oversample):
            hp = inp - lp - q_inv * bp
            bp = bp + f * hp
            lp = lp + f * bp

        if filter_type == FilterType.lp:
            output[i] = lp
        elif filter_type == FilterType.hp:
            output[i] = hp
        elif filter_type == FilterType.bp:
            output[i] = bp
        elif filter_type == FilterType.notch:
            output[i] = inp - bp

    return output.astype(np.float32)

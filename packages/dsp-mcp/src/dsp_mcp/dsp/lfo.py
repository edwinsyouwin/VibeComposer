"""LFO generator with 6 shapes, fully vectorized."""

import numpy as np
from scipy import signal as sp_signal

from ..models import LFOShape


def generate_lfo(
    shape: LFOShape,
    rate_hz: float,
    num_samples: int,
    sample_rate: int = 44100,
    phase_offset: float = 0.0,
) -> np.ndarray:
    """Generate an LFO waveform. Output range: [-1, +1].

    Returns 1D array of shape (num_samples,).
    """
    t = np.arange(num_samples, dtype=np.float64) / sample_rate
    phase = 2.0 * np.pi * rate_hz * t + phase_offset

    if shape == LFOShape.sine:
        out = np.sin(phase)

    elif shape == LFOShape.triangle:
        out = sp_signal.sawtooth(phase, width=0.5)

    elif shape == LFOShape.saw_up:
        out = sp_signal.sawtooth(phase, width=1.0)

    elif shape == LFOShape.saw_down:
        out = sp_signal.sawtooth(phase, width=0.0)

    elif shape == LFOShape.square:
        out = sp_signal.square(phase)

    elif shape == LFOShape.s_and_h:
        # Sample & Hold: random value held per LFO cycle
        cycle_samples = max(int(sample_rate / rate_hz), 1)
        num_cycles = (num_samples // cycle_samples) + 2
        rng = np.random.default_rng(42)
        values = rng.uniform(-1.0, 1.0, num_cycles)
        out = np.repeat(values, cycle_samples)[:num_samples]

    else:
        out = np.sin(phase)  # fallback

    return out.astype(np.float32)

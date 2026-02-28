"""Vectorized ADSR envelope generator using closed-form exponential segments."""

import numpy as np

from ..constants import SAMPLE_RATE


def generate_adsr(
    attack_s: float,
    decay_s: float,
    sustain: float,
    release_s: float,
    note_on_samples: int,
    sample_rate: int = SAMPLE_RATE,
) -> np.ndarray:
    """Generate a complete ADSR envelope as a 1D array.

    The envelope covers note_on_samples + release phase.
    Returns array of shape (total_samples,).
    """
    attack_samples = max(int(attack_s * sample_rate), 1)
    decay_samples = max(int(decay_s * sample_rate), 1)
    release_samples = max(int(release_s * sample_rate), 1)

    # Attack: exponential rise from 0 to 1
    attack_coeff = 1.0 - np.exp(-1.0 / (attack_s * sample_rate))
    attack_n = np.arange(attack_samples, dtype=np.float64)
    attack_env = 1.0 - (1.0 - attack_coeff) ** attack_n

    # Decay: exponential fall from 1 to sustain
    decay_coeff = 1.0 - np.exp(-1.0 / (decay_s * sample_rate))
    decay_n = np.arange(decay_samples, dtype=np.float64)
    decay_env = sustain + (1.0 - sustain) * ((1.0 - decay_coeff) ** decay_n)

    # Sustain: hold for remaining note-on time
    sustain_samples = max(note_on_samples - attack_samples - decay_samples, 0)
    sustain_env = np.full(sustain_samples, sustain, dtype=np.float64)

    # Release: exponential fall from sustain to 0
    release_coeff = 1.0 - np.exp(-1.0 / (release_s * sample_rate))
    release_n = np.arange(release_samples, dtype=np.float64)
    release_env = sustain * ((1.0 - release_coeff) ** release_n)

    return np.concatenate([attack_env, decay_env, sustain_env, release_env]).astype(np.float32)

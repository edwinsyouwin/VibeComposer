"""FFT-based band-limited wavetable generation for anti-aliased playback."""

import numpy as np

from ..constants import TABLE_LENGTH, SAMPLE_RATE


def generate_bandlimited_set(base_table: np.ndarray, sample_rate: int = SAMPLE_RATE) -> list[np.ndarray]:
    """Generate a set of band-limited tables, one per octave.

    Returns a list where index i is safe for frequencies up to sample_rate / 2^(i+1).
    Index 0 = highest frequency (fewest harmonics), last = lowest (most harmonics).
    """
    n = len(base_table)
    spectrum = np.fft.rfft(base_table)
    nyquist = sample_rate / 2.0
    tables = []

    # Generate ~10 tables for octaves from ~20Hz to nyquist
    num_octaves = 10
    for octave in range(num_octaves):
        max_freq = nyquist / (2 ** octave)
        # At this octave, the fundamental plays at max_freq,
        # so we can keep harmonics up to nyquist / max_freq
        max_harmonic = int(nyquist / max(max_freq, 1.0))
        max_harmonic = min(max_harmonic, len(spectrum) - 1)

        limited = np.copy(spectrum)
        limited[max_harmonic + 1:] = 0.0
        table = np.fft.irfft(limited, n=n).astype(np.float32)
        tables.append(table)

    return tables


def select_table_index(freq: float, sample_rate: int = SAMPLE_RATE) -> int:
    """Select the appropriate band-limited table index for a given frequency."""
    if freq <= 0:
        return 0
    nyquist = sample_rate / 2.0
    # octave 0 is for the highest frequencies
    octave = max(0, int(np.log2(nyquist / max(freq, 1.0))))
    return min(octave, 9)

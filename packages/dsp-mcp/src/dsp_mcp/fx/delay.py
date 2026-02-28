"""Delay effect: time/tempo sync, ping-pong, feedback filter."""

import numpy as np
from scipy.signal import lfilter

from ..constants import SAMPLE_RATE
from ..utils import db_to_linear
from .eq import _compute_biquad_coeffs
from ..models import EQBand, EQBandType


def _parse_sync_division(division: str) -> float:
    """Parse sync division string to beats. e.g. '1/4' -> 1.0, '1/8T' -> 0.333"""
    division = division.strip()
    triplet = division.endswith("T")
    dotted = division.endswith("D")
    clean = division.rstrip("TD")

    if "/" in clean:
        num, den = clean.split("/")
        beats = 4.0 * float(num) / float(den)
    else:
        beats = float(clean)

    if triplet:
        beats *= 2.0 / 3.0
    elif dotted:
        beats *= 1.5

    return beats


def apply_delay(
    audio: np.ndarray,
    time_ms: float = 250.0,
    sync_to_tempo: bool = False,
    sync_division: str = "1/4",
    tempo_bpm: float = 120.0,
    feedback: float = 0.3,
    ping_pong: bool = False,
    filter_low_hz: float = 200.0,
    filter_high_hz: float = 8000.0,
    mix: float = 0.3,
    output_gain_db: float = 0.0,
    sample_rate: int = SAMPLE_RATE,
) -> np.ndarray:
    """Apply delay to stereo audio (2, N)."""
    dry = audio.copy()
    n = audio.shape[1]

    # Calculate delay time in samples
    if sync_to_tempo:
        beats = _parse_sync_division(sync_division)
        delay_s = beats * 60.0 / tempo_bpm
    else:
        delay_s = time_ms / 1000.0

    delay_samples = max(int(delay_s * sample_rate), 1)

    # Feedback path filters
    hpf = EQBand(type=EQBandType.high_pass, freq_hz=filter_low_hz, gain_db=0, q=0.707)
    lpf = EQBand(type=EQBandType.low_pass, freq_hz=filter_high_hz, gain_db=0, q=0.707)
    b_hp, a_hp = _compute_biquad_coeffs(hpf, sample_rate)
    b_lp, a_lp = _compute_biquad_coeffs(lpf, sample_rate)

    if ping_pong:
        # Ping-pong: alternating L/R taps
        wet_l = np.zeros(n, dtype=np.float64)
        wet_r = np.zeros(n, dtype=np.float64)

        # Mono input
        mono = ((audio[0] + audio[1]) * 0.5).astype(np.float64)

        # Create a delay line long enough for max taps
        max_taps = 20
        buf = np.zeros(n + delay_samples * max_taps, dtype=np.float64)
        buf[:n] = mono

        # Generate feedback taps
        gain = 1.0
        for tap in range(max_taps):
            offset = delay_samples * (tap + 1)
            if offset >= n:
                break
            gain *= feedback
            if gain < 0.001:
                break

            tap_signal = np.zeros(n, dtype=np.float64)
            if offset < n:
                tap_signal[offset:] = mono[:n - offset] * gain

            # Filter the feedback
            tap_signal = lfilter(b_hp, a_hp, tap_signal)
            tap_signal = lfilter(b_lp, a_lp, tap_signal)

            if tap % 2 == 0:
                wet_l += tap_signal
            else:
                wet_r += tap_signal
    else:
        # Standard stereo delay
        wet_l = np.zeros(n, dtype=np.float64)
        wet_r = np.zeros(n, dtype=np.float64)

        for ch, wet in enumerate([wet_l, wet_r]):
            source = audio[ch].astype(np.float64)
            gain = 1.0
            for tap in range(20):
                offset = delay_samples * (tap + 1)
                if offset >= n:
                    break
                gain *= feedback
                if gain < 0.001:
                    break

                tap_signal = np.zeros(n, dtype=np.float64)
                tap_signal[offset:] = source[:n - offset] * gain

                tap_signal = lfilter(b_hp, a_hp, tap_signal)
                tap_signal = lfilter(b_lp, a_lp, tap_signal)
                wet += tap_signal

    # Mix and output gain
    out_gain = db_to_linear(output_gain_db)
    result = np.zeros_like(dry, dtype=np.float64)
    result[0] = (dry[0] * (1.0 - mix) + wet_l * mix) * out_gain
    result[1] = (dry[1] * (1.0 - mix) + wet_r * mix) * out_gain

    return result.astype(np.float32)

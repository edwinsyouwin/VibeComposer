"""Freeverb-style reverb: 8 parallel comb filters + 4 series allpass."""

import numpy as np
from scipy.signal import lfilter

from ..constants import SAMPLE_RATE
from ..models import ReverbAlgorithm

# Freeverb prime delay lengths (in samples at 44100 Hz)
_COMB_LENGTHS = [1557, 1617, 1491, 1422, 1277, 1356, 1188, 1116]
_ALLPASS_LENGTHS = [556, 441, 341, 225]

# Algorithm presets: scale factors for delay lengths and feedback
_PRESETS = {
    ReverbAlgorithm.room: {"length_scale": 0.6, "feedback_base": 0.7, "allpass_feedback": 0.5},
    ReverbAlgorithm.hall: {"length_scale": 1.0, "feedback_base": 0.84, "allpass_feedback": 0.5},
    ReverbAlgorithm.plate: {"length_scale": 0.8, "feedback_base": 0.8, "allpass_feedback": 0.6},
    ReverbAlgorithm.shimmer: {"length_scale": 1.3, "feedback_base": 0.88, "allpass_feedback": 0.6},
}


def _comb_filter(signal: np.ndarray, delay: int, feedback: float, damping: float) -> np.ndarray:
    """Feedback comb filter with damping (one-pole lowpass in feedback path)."""
    n = len(signal)
    out = np.zeros(n, dtype=np.float64)
    buf = np.zeros(delay, dtype=np.float64)
    buf_idx = 0
    filter_store = 0.0

    for i in range(n):
        buf_out = buf[buf_idx]
        # One-pole lowpass for damping
        filter_store = buf_out * (1.0 - damping) + filter_store * damping
        out[i] = buf_out
        buf[buf_idx] = float(signal[i]) + filter_store * feedback
        buf_idx = (buf_idx + 1) % delay

    return out


def _allpass_filter(signal: np.ndarray, delay: int, feedback: float) -> np.ndarray:
    """Schroeder allpass filter."""
    n = len(signal)
    out = np.zeros(n, dtype=np.float64)
    buf = np.zeros(delay, dtype=np.float64)
    buf_idx = 0

    for i in range(n):
        buf_out = buf[buf_idx]
        inp = float(signal[i])
        out[i] = -inp + buf_out
        buf[buf_idx] = inp + buf_out * feedback
        buf_idx = (buf_idx + 1) % delay

    return out


def apply_reverb(
    audio: np.ndarray,
    algorithm: ReverbAlgorithm = ReverbAlgorithm.hall,
    decay_s: float = 2.0,
    pre_delay_ms: float = 20.0,
    damping: float = 0.5,
    size: float = 0.5,
    diffusion: float = 0.7,
    low_cut_hz: float = 100.0,
    high_cut_hz: float = 10000.0,
    mix: float = 0.3,
    stereo_width: float = 1.0,
    sample_rate: int = SAMPLE_RATE,
) -> np.ndarray:
    """Apply Freeverb-style reverb to stereo audio (2, N)."""
    dry = audio.copy()
    n = audio.shape[1]

    # Mono input for reverb processing
    mono = ((audio[0] + audio[1]) * 0.5).astype(np.float64)

    # Pre-delay
    pre_delay_samples = int(pre_delay_ms * 0.001 * sample_rate)
    if pre_delay_samples > 0:
        mono = np.pad(mono, (pre_delay_samples, 0))[:n]

    preset = _PRESETS[algorithm]
    length_scale = preset["length_scale"] * (0.5 + size * 0.5)

    # Scale feedback from decay time
    feedback = min(preset["feedback_base"] + (decay_s - 1.0) * 0.02, 0.98)

    # Process through 8 parallel comb filters (split 4+4 for stereo)
    comb_out_l = np.zeros(n, dtype=np.float64)
    comb_out_r = np.zeros(n, dtype=np.float64)

    for i, base_len in enumerate(_COMB_LENGTHS):
        delay = max(int(base_len * length_scale * sample_rate / 44100.0), 1)
        result = _comb_filter(mono, delay, feedback, damping)
        if i < 4:
            comb_out_l += result
        else:
            comb_out_r += result

    # Normalize
    comb_out_l /= 4.0
    comb_out_r /= 4.0

    # Series allpass filters for diffusion
    allpass_fb = preset["allpass_feedback"] * diffusion
    for base_len in _ALLPASS_LENGTHS:
        delay = max(int(base_len * length_scale * sample_rate / 44100.0), 1)
        comb_out_l = _allpass_filter(comb_out_l, delay, allpass_fb)
        comb_out_r = _allpass_filter(comb_out_r, delay, allpass_fb)

    # Stereo width
    mid = (comb_out_l + comb_out_r) * 0.5
    side = (comb_out_l - comb_out_r) * 0.5
    wet_l = mid + side * stereo_width
    wet_r = mid - side * stereo_width

    # Simple filtering on wet signal (biquad HPF + LPF)
    from .eq import _compute_biquad_coeffs
    from ..models import EQBand, EQBandType

    hpf = EQBand(type=EQBandType.high_pass, freq_hz=low_cut_hz, gain_db=0, q=0.707)
    lpf = EQBand(type=EQBandType.low_pass, freq_hz=high_cut_hz, gain_db=0, q=0.707)

    for filt in [hpf, lpf]:
        b, a = _compute_biquad_coeffs(filt, sample_rate)
        wet_l = lfilter(b, a, wet_l)
        wet_r = lfilter(b, a, wet_r)

    # Mix
    result = np.zeros_like(dry, dtype=np.float64)
    result[0] = dry[0] * (1.0 - mix) + wet_l * mix
    result[1] = dry[1] * (1.0 - mix) + wet_r * mix

    return result.astype(np.float32)

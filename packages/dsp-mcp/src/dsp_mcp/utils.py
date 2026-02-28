import numpy as np


def midi_to_freq(midi_note: float) -> float:
    return 440.0 * (2.0 ** ((midi_note - 69) / 12.0))


def db_to_linear(db: float) -> float:
    return 10.0 ** (db / 20.0)


def linear_to_db(linear: float) -> float:
    return 20.0 * np.log10(max(abs(linear), 1e-10))


def compute_peak_db(audio: np.ndarray) -> float:
    peak = np.max(np.abs(audio))
    return float(linear_to_db(peak))


def detect_clipping(audio: np.ndarray, threshold: float = 1.0) -> bool:
    return bool(np.any(np.abs(audio) >= threshold))


def normalize(audio: np.ndarray, target_db: float = -1.0) -> np.ndarray:
    peak = np.max(np.abs(audio))
    if peak < 1e-10:
        return audio
    target_linear = db_to_linear(target_db)
    return audio * (target_linear / peak)

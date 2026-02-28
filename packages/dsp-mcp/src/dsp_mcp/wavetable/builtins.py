"""Pre-computed single-cycle waveforms via additive synthesis."""

import numpy as np

from ..constants import TABLE_LENGTH

_cache: dict[str, np.ndarray] = {}


def _generate_sine(n: int = TABLE_LENGTH) -> np.ndarray:
    return np.sin(2.0 * np.pi * np.arange(n) / n).astype(np.float32)


def _generate_saw(n: int = TABLE_LENGTH, num_harmonics: int = 64) -> np.ndarray:
    t = np.arange(n) / n
    out = np.zeros(n, dtype=np.float64)
    for k in range(1, num_harmonics + 1):
        out += ((-1.0) ** (k + 1)) * (2.0 / (np.pi * k)) * np.sin(2.0 * np.pi * k * t)
    return out.astype(np.float32)


def _generate_square(n: int = TABLE_LENGTH, num_harmonics: int = 64) -> np.ndarray:
    t = np.arange(n) / n
    out = np.zeros(n, dtype=np.float64)
    for k in range(1, num_harmonics + 1, 2):  # odd harmonics only
        out += (4.0 / (np.pi * k)) * np.sin(2.0 * np.pi * k * t)
    return out.astype(np.float32)


def _generate_triangle(n: int = TABLE_LENGTH, num_harmonics: int = 64) -> np.ndarray:
    t = np.arange(n) / n
    out = np.zeros(n, dtype=np.float64)
    for k in range(1, num_harmonics + 1, 2):  # odd harmonics only
        sign = (-1.0) ** ((k - 1) / 2)
        out += sign * (8.0 / (np.pi**2 * k**2)) * np.sin(2.0 * np.pi * k * t)
    return out.astype(np.float32)


def _generate_pwm(n: int = TABLE_LENGTH, duty: float = 0.5) -> np.ndarray:
    t = np.arange(n) / n
    return np.where(t < duty, 1.0, -1.0).astype(np.float32)


_GENERATORS = {
    "sine": _generate_sine,
    "saw": _generate_saw,
    "square": _generate_square,
    "triangle": _generate_triangle,
    "pwm": _generate_pwm,
}

BUILTIN_NAMES = list(_GENERATORS.keys())


def get_builtin(name: str) -> np.ndarray:
    if name not in _cache:
        if name not in _GENERATORS:
            raise ValueError(f"Unknown builtin wavetable: {name}")
        _cache[name] = _GENERATORS[name]()
    return _cache[name]

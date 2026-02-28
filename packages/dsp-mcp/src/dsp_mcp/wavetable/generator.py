"""Custom wavetable generation: from harmonics, audio file, or math expression."""

from __future__ import annotations

import math

import numpy as np

from ..constants import TABLE_LENGTH


def from_harmonics(
    harmonics: list[dict],
    table_length: int = TABLE_LENGTH,
) -> list[np.ndarray]:
    """Build a single-frame wavetable from harmonic partials.

    Each entry: {"partial": int, "amplitude": float, "phase_deg": float}
    """
    t = np.arange(table_length, dtype=np.float64) / table_length
    out = np.zeros(table_length, dtype=np.float64)
    for h in harmonics:
        partial = h["partial"]
        amp = h["amplitude"]
        phase = math.radians(h.get("phase_deg", 0.0))
        out += amp * np.sin(2.0 * np.pi * partial * t + phase)

    # Normalize to [-1, 1]
    peak = np.max(np.abs(out))
    if peak > 0:
        out /= peak
    return [out.astype(np.float32)]


def from_audio(
    audio_file_path: str,
    frames: int = 1,
    table_length: int = TABLE_LENGTH,
) -> list[np.ndarray]:
    """Extract wavetable frames from an audio file."""
    import soundfile as sf
    from scipy.signal import resample

    data, sr = sf.read(audio_file_path, dtype="float32")
    if data.ndim > 1:
        data = data.mean(axis=1)  # mono mixdown

    # Split into equal-sized frames
    samples_per_frame = len(data) // frames
    tables = []
    for i in range(frames):
        chunk = data[i * samples_per_frame: (i + 1) * samples_per_frame]
        # Resample to table_length
        resampled = resample(chunk, table_length).astype(np.float32)
        # Normalize
        peak = np.max(np.abs(resampled))
        if peak > 0:
            resampled /= peak
        tables.append(resampled)
    return tables


def from_math_expr(
    expression: str,
    frames: int = 1,
    table_length: int = TABLE_LENGTH,
) -> list[np.ndarray]:
    """Evaluate a math expression over x in [0, 1) to produce a wavetable.

    Allowed names: sin, cos, tan, pi, e, abs, sqrt, log, exp, x, frame
    """
    allowed_names = {
        "sin": np.sin,
        "cos": np.cos,
        "tan": np.tan,
        "pi": np.pi,
        "e": np.e,
        "abs": np.abs,
        "sqrt": np.sqrt,
        "log": np.log,
        "exp": np.exp,
    }

    x = np.linspace(0.0, 1.0, table_length, endpoint=False, dtype=np.float64)
    tables = []

    for f_idx in range(frames):
        local_ns = {**allowed_names, "x": x, "frame": f_idx / max(frames - 1, 1)}
        try:
            result = eval(expression, {"__builtins__": {}}, local_ns)  # noqa: S307
        except Exception as exc:
            raise ValueError(f"Failed to evaluate expression: {exc}") from exc

        result = np.asarray(result, dtype=np.float64)
        if result.shape != (table_length,):
            raise ValueError(f"Expression must produce {table_length} samples, got shape {result.shape}")

        peak = np.max(np.abs(result))
        if peak > 0:
            result /= peak
        tables.append(result.astype(np.float32))

    return tables

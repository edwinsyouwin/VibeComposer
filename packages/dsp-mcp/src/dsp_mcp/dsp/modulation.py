"""Modulation matrix: evaluate all routings to per-sample mod arrays."""

from __future__ import annotations

import numpy as np

from ..models import PatchModulation, ModSource, ModDestination, LFOConfig
from .lfo import generate_lfo


def evaluate_modulation(
    mod: PatchModulation,
    num_samples: int,
    sample_rate: int = 44100,
    velocity: float = 1.0,
) -> dict[ModDestination, np.ndarray]:
    """Evaluate all modulation routings and return per-destination mod arrays.

    Returns dict mapping destination -> per-sample modulation value.
    """
    # Pre-generate LFO signals
    lfo_signals: dict[str, np.ndarray] = {}
    for lfo_cfg in mod.lfos:
        lfo_signals[lfo_cfg.id] = generate_lfo(
            shape=lfo_cfg.shape,
            rate_hz=lfo_cfg.rate_hz,
            num_samples=num_samples,
            sample_rate=sample_rate,
        )

    # Build source signals
    def get_source(source: ModSource) -> np.ndarray:
        if source == ModSource.lfo1:
            return lfo_signals.get("lfo1", np.zeros(num_samples, dtype=np.float32))
        elif source == ModSource.lfo2:
            return lfo_signals.get("lfo2", np.zeros(num_samples, dtype=np.float32))
        elif source == ModSource.velocity:
            return np.full(num_samples, velocity * 2.0 - 1.0, dtype=np.float32)  # map to [-1, 1]
        elif source == ModSource.random:
            rng = np.random.default_rng()
            return rng.uniform(-1.0, 1.0, num_samples).astype(np.float32)
        elif source in (ModSource.env1, ModSource.env2):
            # Envelopes are applied directly in the voice; return zeros here
            return np.zeros(num_samples, dtype=np.float32)
        else:
            return np.zeros(num_samples, dtype=np.float32)

    # Evaluate routings
    result: dict[ModDestination, np.ndarray] = {}
    for routing in mod.routings:
        source_signal = get_source(routing.source)

        if routing.bipolar:
            mod_signal = source_signal * routing.amount
        else:
            unipolar = (source_signal + 1.0) * 0.5
            mod_signal = unipolar * routing.amount

        if routing.destination in result:
            result[routing.destination] = result[routing.destination] + mod_signal
        else:
            result[routing.destination] = mod_signal.copy()

    return result

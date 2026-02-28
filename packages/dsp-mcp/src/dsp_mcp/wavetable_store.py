from __future__ import annotations

import uuid

import numpy as np


class WavetableStore:
    """Stores wavetable data: each entry is a list of frames, each frame a 1D array."""

    def __init__(self) -> None:
        self._tables: dict[str, list[np.ndarray]] = {}

    def store(self, frames: list[np.ndarray]) -> str:
        wt_id = f"wt_{uuid.uuid4().hex[:8]}"
        self._tables[wt_id] = [f.astype(np.float32) for f in frames]
        return wt_id

    def get(self, wt_id: str) -> list[np.ndarray]:
        if wt_id not in self._tables:
            raise KeyError(f"Wavetable '{wt_id}' not found")
        return self._tables[wt_id]

    def info(self, wt_id: str) -> dict:
        frames = self.get(wt_id)
        return {
            "wavetable_id": wt_id,
            "frames": len(frames),
            "table_length": len(frames[0]) if frames else 0,
        }

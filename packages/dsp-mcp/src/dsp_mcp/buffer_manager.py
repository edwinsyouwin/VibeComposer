from __future__ import annotations

import uuid

import numpy as np

from .utils import compute_peak_db, detect_clipping


class BufferManager:
    def __init__(self) -> None:
        self._buffers: dict[str, np.ndarray] = {}

    def store(self, audio: np.ndarray) -> str:
        buf_id = f"buf_{uuid.uuid4().hex[:8]}"
        self._buffers[buf_id] = audio.astype(np.float32)
        return buf_id

    def get(self, buf_id: str) -> np.ndarray:
        if buf_id not in self._buffers:
            raise KeyError(f"Buffer '{buf_id}' not found")
        return self._buffers[buf_id]

    def dispose(self, buf_ids: list[str]) -> int:
        disposed = 0
        for bid in buf_ids:
            if bid in self._buffers:
                del self._buffers[bid]
                disposed += 1
        return disposed

    def info(self, buf_id: str) -> dict:
        audio = self.get(buf_id)
        return {
            "buffer_id": buf_id,
            "channels": audio.shape[0],
            "length_samples": audio.shape[1],
            "peak_db": compute_peak_db(audio),
            "clipped": detect_clipping(audio),
        }

    @property
    def count(self) -> int:
        return len(self._buffers)

from __future__ import annotations

import uuid

from .models import SynthPatch, PatchModulation


class PatchStore:
    def __init__(self) -> None:
        self._patches: dict[str, SynthPatch] = {}
        self._modulations: dict[str, PatchModulation] = {}

    def store(self, patch: SynthPatch) -> str:
        patch_id = f"patch_{uuid.uuid4().hex[:8]}"
        self._patches[patch_id] = patch
        self._modulations[patch_id] = PatchModulation()
        return patch_id

    def get(self, patch_id: str) -> SynthPatch:
        if patch_id not in self._patches:
            raise KeyError(f"Patch '{patch_id}' not found")
        return self._patches[patch_id]

    def get_modulation(self, patch_id: str) -> PatchModulation:
        if patch_id not in self._modulations:
            raise KeyError(f"Patch '{patch_id}' not found")
        return self._modulations[patch_id]

    def set_modulation(self, patch_id: str, mod: PatchModulation) -> int:
        if patch_id not in self._patches:
            raise KeyError(f"Patch '{patch_id}' not found")
        self._modulations[patch_id] = mod
        return len(mod.routings)

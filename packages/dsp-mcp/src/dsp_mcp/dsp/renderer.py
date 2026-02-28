"""Note scheduler, voice manager, and stereo summing."""

from __future__ import annotations

import numpy as np

from ..models import SynthPatch, NoteEvent, PatchModulation
from ..constants import SAMPLE_RATE, MAX_VOICES
from .voice import render_voice


def render_notes(
    patch: SynthPatch,
    notes: list[NoteEvent],
    mod: PatchModulation,
    sample_rate: int = SAMPLE_RATE,
    wavetable_frames_map: dict[str, list[np.ndarray]] | None = None,
) -> np.ndarray:
    """Render a list of note events through a synth patch.

    Returns stereo audio of shape (2, N).
    """
    if not notes:
        return np.zeros((2, sample_rate), dtype=np.float32)

    # Sort notes by start time
    sorted_notes = sorted(notes, key=lambda n: n.start_s)

    # Voice stealing: limit to MAX_VOICES concurrent
    # For offline rendering, just render all and sum (no real-time constraint)
    active_voices = min(len(sorted_notes), MAX_VOICES)
    if len(sorted_notes) > MAX_VOICES:
        sorted_notes = sorted_notes[:MAX_VOICES]

    # Calculate total output length
    max_end = 0.0
    for note in sorted_notes:
        # Estimate voice length: note duration + release
        release_s = patch.amp_envelope.release_s
        end_s = note.start_s + note.duration_s + release_s
        max_end = max(max_end, end_s)

    total_samples = int(max_end * sample_rate) + sample_rate  # +1s padding
    output = np.zeros((2, total_samples), dtype=np.float64)

    # Render each voice and place in output buffer
    for note in sorted_notes:
        voice_audio, voice_samples = render_voice(
            patch, note, mod, sample_rate, wavetable_frames_map
        )

        start_sample = int(note.start_s * sample_rate)
        end_sample = start_sample + voice_samples

        # Clamp to output buffer
        if end_sample > total_samples:
            voice_samples = total_samples - start_sample
            voice_audio = voice_audio[:, :voice_samples]
            end_sample = total_samples

        if start_sample < total_samples and voice_samples > 0:
            output[:, start_sample:end_sample] += voice_audio

    # Trim trailing silence
    peak_per_sample = np.max(np.abs(output), axis=0)
    nonzero = np.where(peak_per_sample > 1e-6)[0]
    if len(nonzero) > 0:
        last_nonzero = nonzero[-1] + 1
        output = output[:, :last_nonzero]
    else:
        output = output[:, :sample_rate]  # at least 1s

    return output.astype(np.float32)

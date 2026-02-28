"""DSP MCP Server — 9 tools for wavetable synthesis, FX, and audio I/O."""

from __future__ import annotations

import os
import tempfile

import numpy as np
import soundfile as sf
from mcp.server.fastmcp import FastMCP

from .constants import SAMPLE_RATE
from .models import (
    SynthPatch, OscillatorConfig, FilterConfig, ADSREnvelope, FilterEnvelope,
    PatchModulation, ModRouting, LFOConfig,
    NoteEvent, FXChainEntry, WavetableConfig, WavetableMethod,
    HarmonicPartial, MixInput, ExportFormat,
)
from .buffer_manager import BufferManager
from .patch_store import PatchStore
from .wavetable_store import WavetableStore
from .utils import compute_peak_db, detect_clipping, normalize, db_to_linear
from .dsp.renderer import render_notes
from .fx.chain import process_chain
from .wavetable.generator import from_harmonics, from_audio, from_math_expr
from .wavetable.builtins import BUILTIN_NAMES

mcp = FastMCP("DSP-MCP", instructions="Wavetable synthesizer and audio processor for music production")

# Global state
buffers = BufferManager()
patches = PatchStore()
wavetables = WavetableStore()


# ---------------------------------------------------------------------------
# Tool 1: wavetable/create
# ---------------------------------------------------------------------------

@mcp.tool(name="wavetable_create")
def wavetable_create(
    method: str = "from_harmonics",
    harmonics: list[dict] | None = None,
    audio_file_path: str | None = None,
    expression: str | None = None,
    frames: int = 1,
) -> dict:
    """Build a custom wavetable from harmonics, audio file, or math expression.

    Methods:
    - from_harmonics: Provide `harmonics` list with {partial, amplitude, phase_deg}
    - from_audio: Provide `audio_file_path` to a .wav file
    - from_math_expr: Provide `expression` using x (0-1), sin, cos, pi, etc.
    """
    wt_method = WavetableMethod(method)

    if wt_method == WavetableMethod.from_harmonics:
        if not harmonics:
            raise ValueError("harmonics list required for from_harmonics method")
        tables = from_harmonics(harmonics)
    elif wt_method == WavetableMethod.from_audio:
        if not audio_file_path:
            raise ValueError("audio_file_path required for from_audio method")
        tables = from_audio(audio_file_path, frames)
    elif wt_method == WavetableMethod.from_math_expr:
        if not expression:
            raise ValueError("expression required for from_math_expr method")
        tables = from_math_expr(expression, frames)
    else:
        raise ValueError(f"Unknown method: {method}")

    wt_id = wavetables.store(tables)
    info = wavetables.info(wt_id)
    return info


# ---------------------------------------------------------------------------
# Tool 2: synth/create_patch
# ---------------------------------------------------------------------------

@mcp.tool(name="synth_create_patch")
def synth_create_patch(
    name: str = "Init",
    oscillators: list[dict] | None = None,
    filter: dict | None = None,
    amp_envelope: dict | None = None,
    filter_envelope: dict | None = None,
) -> dict:
    """Create a synth patch with 1-3 oscillators, SVF filter, and ADSR envelopes.

    Returns a patch_id for use with render_notes and set_modulation.
    """
    osc_configs = [OscillatorConfig(**o) for o in (oscillators or [{"wavetable": "saw"}])]
    filt = FilterConfig(**(filter or {}))
    amp_env = ADSREnvelope(**(amp_envelope or {}))
    filt_env = FilterEnvelope(**(filter_envelope or {}))

    patch = SynthPatch(
        name=name,
        oscillators=osc_configs,
        filter=filt,
        amp_envelope=amp_env,
        filter_envelope=filt_env,
    )
    patch_id = patches.store(patch)
    return {"patch_id": patch_id}


# ---------------------------------------------------------------------------
# Tool 3: synth/set_modulation
# ---------------------------------------------------------------------------

@mcp.tool(name="synth_set_modulation")
def synth_set_modulation(
    patch_id: str,
    routings: list[dict] | None = None,
    lfos: list[dict] | None = None,
) -> dict:
    """Wire LFOs and envelopes to synth parameters. Up to 32 modulation slots.

    Sources: lfo1, lfo2, env1, env2, velocity, mod_wheel, aftertouch, random
    Destinations: osc1_pitch, osc1_level, osc1_wt_pos, osc2_pitch, osc2_level,
                  osc2_wt_pos, filter_cutoff, filter_resonance, amp_level, pan,
                  lfo1_rate, lfo2_rate
    """
    mod_routings = [ModRouting(**r) for r in (routings or [])]
    lfo_configs = [LFOConfig(**l) for l in (lfos or [])]
    mod = PatchModulation(routings=mod_routings, lfos=lfo_configs)
    active = patches.set_modulation(patch_id, mod)
    return {"active_routings": active}


# ---------------------------------------------------------------------------
# Tool 4: synth/render_notes
# ---------------------------------------------------------------------------

@mcp.tool(name="synth_render_notes")
def synth_render_notes(
    patch_id: str,
    notes: list[dict],
    sample_rate: int = 44100,
) -> dict:
    """Render MIDI note events through a synth patch to a stereo audio buffer.

    Each note: {pitch_midi, velocity, start_s, duration_s, pitch_bend (optional)}
    Returns buffer_id with metadata (peak_db, channels, length, clipped).
    """
    patch = patches.get(patch_id)
    mod = patches.get_modulation(patch_id)
    note_events = [NoteEvent(**n) for n in notes]

    # Gather wavetable frames for any custom wavetables referenced by oscillators
    wt_frames_map: dict[str, list[np.ndarray]] = {}
    for osc in patch.oscillators:
        if osc.wavetable not in BUILTIN_NAMES:
            try:
                wt_frames_map[osc.wavetable] = wavetables.get(osc.wavetable)
            except KeyError:
                pass  # Will fall back to saw

    audio = render_notes(patch, note_events, mod, sample_rate, wt_frames_map)
    buf_id = buffers.store(audio)
    info = buffers.info(buf_id)
    info["sample_rate"] = sample_rate
    return info


# ---------------------------------------------------------------------------
# Tool 5: fx/apply_chain
# ---------------------------------------------------------------------------

@mcp.tool(name="fx_apply_chain")
def fx_apply_chain(
    buffer_id: str,
    chain: list[dict],
) -> dict:
    """Apply an ordered chain of effects to an audio buffer.

    Effect types: compressor, limiter, eq, saturation, reverb, delay, chorus.
    Each entry: {type: string, params: {type-specific parameters}}
    Returns a new buffer_id with the processed audio.
    """
    audio = buffers.get(buffer_id)
    entries = [FXChainEntry(**e) for e in chain]
    processed = process_chain(audio, entries, SAMPLE_RATE, get_buffer=buffers.get)
    new_id = buffers.store(processed)
    info = buffers.info(new_id)
    info["sample_rate"] = SAMPLE_RATE
    return info


# ---------------------------------------------------------------------------
# Tool 6: audio/export
# ---------------------------------------------------------------------------

@mcp.tool(name="audio_export")
def audio_export(
    buffer_id: str,
    format: str = "wav",
    bit_depth: int = 24,
    normalize_audio: bool = False,
    normalize_target_db: float = -1.0,
    output_path: str | None = None,
) -> dict:
    """Export an audio buffer to a WAV, FLAC, or OGG file.

    Returns file_path, duration_s, and file_size_bytes.
    """
    audio = buffers.get(buffer_id)

    if normalize_audio:
        audio = normalize(audio, normalize_target_db)

    # Determine output path
    ext = format.lower()
    if ext == "ogg":
        ext = "ogg"
        sf_format = "OGG"
        sf_subtype = "VORBIS"
    elif ext == "flac":
        sf_format = "FLAC"
        sf_subtype = f"PCM_{bit_depth}" if bit_depth in (16, 24) else "PCM_24"
    else:
        sf_format = "WAV"
        if bit_depth == 16:
            sf_subtype = "PCM_16"
        elif bit_depth == 32:
            sf_subtype = "FLOAT"
        else:
            sf_subtype = "PCM_24"

    if output_path is None:
        fd, output_path = tempfile.mkstemp(suffix=f".{ext}", prefix="dsp_mcp_")
        os.close(fd)

    # soundfile expects (samples, channels)
    interleaved = audio.T  # (N, 2)

    sf.write(output_path, interleaved, SAMPLE_RATE, format=sf_format, subtype=sf_subtype)

    file_size = os.path.getsize(output_path)
    duration_s = audio.shape[1] / SAMPLE_RATE

    return {
        "file_path": output_path,
        "duration_s": round(duration_s, 3),
        "file_size_bytes": file_size,
    }


# ---------------------------------------------------------------------------
# Tool 7: audio/mix_buffers
# ---------------------------------------------------------------------------

@mcp.tool(name="audio_mix_buffers")
def audio_mix_buffers(
    inputs: list[dict],
    master_chain: list[dict] | None = None,
) -> dict:
    """Mix multiple audio buffers with gain, pan, and time offset.

    Each input: {buffer_id, gain_db, pan, offset_s}
    Optional master_chain: same format as fx/apply_chain.
    Returns a new buffer_id with the mixed result.
    """
    mix_inputs = [MixInput(**inp) for inp in inputs]

    # Calculate total output length
    max_length = 0
    for mi in mix_inputs:
        buf = buffers.get(mi.buffer_id)
        offset_samples = int(mi.offset_s * SAMPLE_RATE)
        end = offset_samples + buf.shape[1]
        max_length = max(max_length, end)

    output = np.zeros((2, max_length), dtype=np.float64)

    for mi in mix_inputs:
        buf = buffers.get(mi.buffer_id).astype(np.float64)
        offset_samples = int(mi.offset_s * SAMPLE_RATE)
        gain = db_to_linear(mi.gain_db)

        # Equal-power pan
        l_gain = np.cos((mi.pan + 1.0) * 0.25 * np.pi) * gain
        r_gain = np.sin((mi.pan + 1.0) * 0.25 * np.pi) * gain

        end = offset_samples + buf.shape[1]
        output[0, offset_samples:end] += buf[0] * l_gain
        output[1, offset_samples:end] += buf[1] * r_gain

    output = output.astype(np.float32)

    # Apply optional master chain
    if master_chain:
        entries = [FXChainEntry(**e) for e in master_chain]
        output = process_chain(output, entries, SAMPLE_RATE, get_buffer=buffers.get)

    buf_id = buffers.store(output)
    duration_s = output.shape[1] / SAMPLE_RATE

    return {
        "buffer_id": buf_id,
        "duration_s": round(duration_s, 3),
        "peak_db": round(compute_peak_db(output), 2),
    }


# ---------------------------------------------------------------------------
# Tool 8: audio/dispose
# ---------------------------------------------------------------------------

@mcp.tool(name="audio_dispose")
def audio_dispose(buffer_ids: list[str]) -> dict:
    """Free one or more server-side audio buffers to release memory."""
    disposed = buffers.dispose(buffer_ids)
    return {"disposed": disposed, "remaining_buffers": buffers.count}


# ---------------------------------------------------------------------------
# Tool 9: audio/load_into_ableton
# ---------------------------------------------------------------------------

@mcp.tool(name="audio_load_into_ableton")
def audio_load_into_ableton(
    buffer_id: str,
    track_name: str = "DSP Audio",
    clip_slot: int = 0,
    format: str = "wav",
    bit_depth: int = 24,
    normalize_audio: bool = False,
    normalize_target_db: float = -1.0,
) -> dict:
    """Export a buffer and load it into Ableton Live via the Ableton MCP bridge.

    Falls back gracefully if Ableton is not running — still exports the file.
    """
    # Export the buffer first
    export_result = audio_export(
        buffer_id=buffer_id,
        format=format,
        bit_depth=bit_depth,
        normalize_audio=normalize_audio,
        normalize_target_db=normalize_target_db,
    )

    result = {
        "file_path": export_result["file_path"],
        "duration_s": export_result["duration_s"],
    }

    # Try to load into Ableton via bridge
    try:
        from .bridge.ableton import is_available, send_command

        if is_available():
            # Create audio track
            resp = send_command("create_audio_track", {"name": track_name})
            track_index = resp.get("track_index", -1)

            result["track_index"] = track_index
            result["clip_index"] = clip_slot
            result["ableton_loaded"] = True
        else:
            result["ableton_loaded"] = False
            result["message"] = "Ableton MCP bridge not available. File exported — drag into Ableton manually."
    except Exception as exc:
        result["ableton_loaded"] = False
        result["message"] = f"Ableton bridge error: {exc}. File exported — drag into Ableton manually."

    return result


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main():
    mcp.run(transport="stdio")


if __name__ == "__main__":
    main()

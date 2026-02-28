from __future__ import annotations

from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


# --- Enums ---

class FilterType(str, Enum):
    lp = "lp"
    hp = "hp"
    bp = "bp"
    notch = "notch"


class ModSource(str, Enum):
    lfo1 = "lfo1"
    lfo2 = "lfo2"
    env1 = "env1"
    env2 = "env2"
    velocity = "velocity"
    mod_wheel = "mod_wheel"
    aftertouch = "aftertouch"
    random = "random"


class ModDestination(str, Enum):
    osc1_pitch = "osc1_pitch"
    osc1_level = "osc1_level"
    osc1_wt_pos = "osc1_wt_pos"
    osc2_pitch = "osc2_pitch"
    osc2_level = "osc2_level"
    osc2_wt_pos = "osc2_wt_pos"
    filter_cutoff = "filter_cutoff"
    filter_resonance = "filter_resonance"
    amp_level = "amp_level"
    pan = "pan"
    lfo1_rate = "lfo1_rate"
    lfo2_rate = "lfo2_rate"


class LFOShape(str, Enum):
    sine = "sine"
    triangle = "triangle"
    saw_up = "saw_up"
    saw_down = "saw_down"
    square = "square"
    s_and_h = "s_and_h"


class SaturationAlgorithm(str, Enum):
    tanh = "tanh"
    cubic = "cubic"
    hard_clip = "hard_clip"
    tape = "tape"


class EQBandType(str, Enum):
    low_shelf = "low_shelf"
    high_shelf = "high_shelf"
    peak = "peak"
    low_pass = "low_pass"
    high_pass = "high_pass"


class ReverbAlgorithm(str, Enum):
    room = "room"
    hall = "hall"
    plate = "plate"
    shimmer = "shimmer"


class FXType(str, Enum):
    compressor = "compressor"
    limiter = "limiter"
    eq = "eq"
    saturation = "saturation"
    reverb = "reverb"
    delay = "delay"
    chorus = "chorus"


class ExportFormat(str, Enum):
    wav = "wav"
    ogg = "ogg"
    flac = "flac"


class WavetableMethod(str, Enum):
    from_harmonics = "from_harmonics"
    from_audio = "from_audio"
    from_math_expr = "from_math_expr"


# --- Synth models ---

class OscillatorConfig(BaseModel):
    wavetable: str = "saw"
    octave: int = Field(0, ge=-3, le=3)
    semi: int = Field(0, ge=-12, le=12)
    fine: float = Field(0.0, ge=-100.0, le=100.0)
    level: float = Field(1.0, ge=0.0, le=1.0)
    pan: float = Field(0.0, ge=-1.0, le=1.0)
    wavetable_position: float = Field(0.0, ge=0.0, le=1.0)
    unison_voices: int = Field(1, ge=1, le=16)
    unison_detune: float = Field(0.0, ge=0.0, le=100.0)


class FilterConfig(BaseModel):
    type: FilterType = FilterType.lp
    cutoff_hz: float = Field(20000.0, ge=20.0, le=20000.0)
    resonance: float = Field(0.0, ge=0.0, le=1.0)
    drive: float = Field(0.0, ge=0.0, le=1.0)


class ADSREnvelope(BaseModel):
    attack_s: float = Field(0.01, ge=0.001, le=10.0)
    decay_s: float = Field(0.1, ge=0.001, le=10.0)
    sustain: float = Field(1.0, ge=0.0, le=1.0)
    release_s: float = Field(0.1, ge=0.001, le=20.0)


class FilterEnvelope(BaseModel):
    attack_s: float = Field(0.01, ge=0.001, le=10.0)
    decay_s: float = Field(0.1, ge=0.001, le=10.0)
    sustain: float = Field(0.0, ge=0.0, le=1.0)
    release_s: float = Field(0.1, ge=0.001, le=20.0)
    depth: float = Field(0.0, ge=-1.0, le=1.0)


class SynthPatch(BaseModel):
    name: str = "Init"
    oscillators: list[OscillatorConfig] = Field(default_factory=lambda: [OscillatorConfig()])
    filter: FilterConfig = Field(default_factory=FilterConfig)
    amp_envelope: ADSREnvelope = Field(default_factory=ADSREnvelope)
    filter_envelope: FilterEnvelope = Field(default_factory=FilterEnvelope)


# --- Modulation ---

class ModRouting(BaseModel):
    source: ModSource
    destination: ModDestination
    amount: float = Field(0.0, ge=-1.0, le=1.0)
    bipolar: bool = True


class LFOConfig(BaseModel):
    id: str = "lfo1"
    shape: LFOShape = LFOShape.sine
    rate_hz: float = Field(1.0, ge=0.01, le=50.0)
    sync_to_tempo: bool = False
    sync_division: Optional[str] = None


class PatchModulation(BaseModel):
    routings: list[ModRouting] = Field(default_factory=list)
    lfos: list[LFOConfig] = Field(default_factory=list)


# --- Note events ---

class NoteEvent(BaseModel):
    pitch_midi: int = Field(ge=0, le=127)
    velocity: float = Field(0.8, ge=0.0, le=1.0)
    start_s: float = Field(0.0, ge=0.0)
    duration_s: float = Field(1.0, ge=0.0)
    pitch_bend: float = Field(0.0, ge=-1.0, le=1.0)


# --- FX param models ---

class CompressorParams(BaseModel):
    threshold_db: float = Field(-12.0, ge=-60.0, le=0.0)
    ratio: float = Field(4.0, ge=1.0, le=20.0)
    attack_ms: float = Field(10.0, ge=0.1, le=100.0)
    release_ms: float = Field(100.0, ge=10.0, le=2000.0)
    knee_db: float = Field(3.0, ge=0.0, le=12.0)
    makeup_db: float = Field(0.0, ge=0.0, le=24.0)
    sidechain_buffer_id: Optional[str] = None


class LimiterParams(BaseModel):
    ceiling_db: float = Field(-1.0, ge=-6.0, le=0.0)
    release_ms: float = Field(50.0, ge=1.0, le=500.0)
    lookahead_ms: float = Field(5.0, ge=0.0, le=10.0)


class EQBand(BaseModel):
    type: EQBandType = EQBandType.peak
    freq_hz: float = Field(1000.0, ge=20.0, le=20000.0)
    gain_db: float = Field(0.0, ge=-18.0, le=18.0)
    q: float = Field(1.0, ge=0.1, le=10.0)


class EQParams(BaseModel):
    bands: list[EQBand] = Field(default_factory=list)


class SaturationParams(BaseModel):
    algorithm: SaturationAlgorithm = SaturationAlgorithm.tanh
    drive: float = Field(0.3, ge=0.0, le=1.0)
    mix: float = Field(1.0, ge=0.0, le=1.0)
    output_gain_db: float = Field(0.0, ge=-12.0, le=12.0)


class ReverbParams(BaseModel):
    algorithm: ReverbAlgorithm = ReverbAlgorithm.hall
    decay_s: float = Field(2.0, ge=0.1, le=30.0)
    pre_delay_ms: float = Field(20.0, ge=0.0, le=100.0)
    damping: float = Field(0.5, ge=0.0, le=1.0)
    size: float = Field(0.5, ge=0.0, le=1.0)
    diffusion: float = Field(0.7, ge=0.0, le=1.0)
    low_cut_hz: float = Field(100.0, ge=20.0, le=500.0)
    high_cut_hz: float = Field(10000.0, ge=1000.0, le=20000.0)
    mix: float = Field(0.3, ge=0.0, le=1.0)
    stereo_width: float = Field(1.0, ge=0.0, le=1.0)


class DelayParams(BaseModel):
    time_ms: float = Field(250.0, ge=1.0, le=5000.0)
    sync_to_tempo: bool = False
    sync_division: str = "1/4"
    tempo_bpm: float = Field(120.0, ge=40.0, le=300.0)
    feedback: float = Field(0.3, ge=0.0, le=0.95)
    ping_pong: bool = False
    filter_low_hz: float = Field(200.0, ge=20.0, le=2000.0)
    filter_high_hz: float = Field(8000.0, ge=1000.0, le=20000.0)
    mix: float = Field(0.3, ge=0.0, le=1.0)
    output_gain_db: float = Field(0.0, ge=-12.0, le=6.0)


class ChorusParams(BaseModel):
    rate_hz: float = Field(1.0, ge=0.1, le=10.0)
    depth_ms: float = Field(3.0, ge=0.1, le=10.0)
    voices: int = Field(3, ge=2, le=6)
    feedback: float = Field(0.2, ge=0.0, le=0.8)
    mix: float = Field(0.5, ge=0.0, le=1.0)
    stereo_spread: float = Field(0.8, ge=0.0, le=1.0)


class FXChainEntry(BaseModel):
    type: FXType
    params: dict


# --- Audio I/O models ---

class ExportConfig(BaseModel):
    buffer_id: str
    format: ExportFormat = ExportFormat.wav
    bit_depth: int = Field(24, ge=16, le=32)
    normalize: bool = False
    normalize_target_db: float = Field(-1.0, ge=-3.0, le=0.0)


class MixInput(BaseModel):
    buffer_id: str
    gain_db: float = Field(0.0, le=12.0)
    pan: float = Field(0.0, ge=-1.0, le=1.0)
    offset_s: float = Field(0.0, ge=0.0)


# --- Wavetable creation ---

class HarmonicPartial(BaseModel):
    partial: int = Field(ge=1, le=256)
    amplitude: float = Field(1.0, ge=0.0, le=1.0)
    phase_deg: float = Field(0.0, ge=0.0, le=360.0)


class WavetableConfig(BaseModel):
    method: WavetableMethod = WavetableMethod.from_harmonics
    harmonics: Optional[list[HarmonicPartial]] = None
    audio_file_path: Optional[str] = None
    expression: Optional[str] = None
    frames: int = Field(1, ge=1, le=256)

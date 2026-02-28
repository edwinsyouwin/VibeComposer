"""FX chain orchestrator: instantiate and process effects in sequence."""

from __future__ import annotations

import numpy as np

from ..models import (
    FXType, FXChainEntry,
    CompressorParams, LimiterParams, EQParams, SaturationParams,
    ReverbParams, DelayParams, ChorusParams,
)
from ..constants import SAMPLE_RATE
from .saturation import apply_saturation
from .eq import apply_eq
from .compressor import apply_compressor
from .limiter import apply_limiter
from .reverb import apply_reverb
from .delay import apply_delay
from .chorus import apply_chorus


def process_chain(
    audio: np.ndarray,
    chain: list[FXChainEntry],
    sample_rate: int = SAMPLE_RATE,
    get_buffer=None,
) -> np.ndarray:
    """Process audio through an ordered FX chain.

    Args:
        audio: Stereo audio (2, N).
        chain: List of FX entries with type and params.
        sample_rate: Sample rate.
        get_buffer: Optional callable to retrieve sidechain buffers.

    Returns:
        Processed stereo audio (2, N).
    """
    result = audio.copy()

    for entry in chain:
        if entry.type == FXType.saturation:
            p = SaturationParams(**entry.params)
            result = apply_saturation(result, p.algorithm, p.drive, p.mix, p.output_gain_db)

        elif entry.type == FXType.eq:
            p = EQParams(**entry.params)
            result = apply_eq(result, p.bands, sample_rate)

        elif entry.type == FXType.compressor:
            p = CompressorParams(**entry.params)
            sidechain = None
            if p.sidechain_buffer_id and get_buffer:
                try:
                    sidechain = get_buffer(p.sidechain_buffer_id)
                except KeyError:
                    pass
            result = apply_compressor(
                result, p.threshold_db, p.ratio, p.attack_ms, p.release_ms,
                p.knee_db, p.makeup_db, sidechain, sample_rate,
            )

        elif entry.type == FXType.limiter:
            p = LimiterParams(**entry.params)
            result = apply_limiter(result, p.ceiling_db, p.release_ms, p.lookahead_ms, sample_rate)

        elif entry.type == FXType.reverb:
            p = ReverbParams(**entry.params)
            result = apply_reverb(
                result, p.algorithm, p.decay_s, p.pre_delay_ms, p.damping,
                p.size, p.diffusion, p.low_cut_hz, p.high_cut_hz,
                p.mix, p.stereo_width, sample_rate,
            )

        elif entry.type == FXType.delay:
            p = DelayParams(**entry.params)
            result = apply_delay(
                result, p.time_ms, p.sync_to_tempo, p.sync_division,
                p.tempo_bpm, p.feedback, p.ping_pong,
                p.filter_low_hz, p.filter_high_hz, p.mix, p.output_gain_db,
                sample_rate,
            )

        elif entry.type == FXType.chorus:
            p = ChorusParams(**entry.params)
            result = apply_chorus(
                result, p.rate_hz, p.depth_ms, p.voices,
                p.feedback, p.mix, p.stereo_spread, sample_rate,
            )

    return result

#!/usr/bin/env python3
"""
Audio analysis script for VibeComposer Music Video Generator.

Analyzes an audio file and outputs structured JSON with:
- BPM, key, time signature
- Beat grid with energy levels
- Song sections (intro, build, drop, breakdown, etc.)
- Transitions between sections
- Energy curve
- Spectral profile

Dependencies: librosa, numpy, scipy, madmom (optional)
Install: pip install librosa numpy scipy

Usage: python analyze_audio.py <audio_file_path> [--output <json_path>]
"""

import json
import sys
import uuid
from pathlib import Path

import librosa
import numpy as np


def detect_key(y: np.ndarray, sr: int) -> str:
    """Detect the musical key using chroma features."""
    chroma = librosa.feature.chroma_cqt(y=y, sr=sr)
    chroma_mean = np.mean(chroma, axis=1)

    keys = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

    # Krumhansl-Kessler key profiles
    major_profile = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88]
    minor_profile = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17]

    best_corr = -1
    best_key = 'C'

    for i in range(12):
        rotated_chroma = np.roll(chroma_mean, -i)

        major_corr = np.corrcoef(rotated_chroma, major_profile)[0, 1]
        minor_corr = np.corrcoef(rotated_chroma, minor_profile)[0, 1]

        if major_corr > best_corr:
            best_corr = major_corr
            best_key = keys[i]
        if minor_corr > best_corr:
            best_corr = minor_corr
            best_key = f"{keys[i]}m"

    return best_key


def compute_energy_curve(y: np.ndarray, sr: int, hop_length: int = 512) -> list:
    """Compute energy curve as RMS over time."""
    rms = librosa.feature.rms(y=y, hop_length=hop_length)[0]
    times = librosa.frames_to_time(np.arange(len(rms)), sr=sr, hop_length=hop_length)

    # Normalize to 0-1
    rms_norm = rms / (np.max(rms) + 1e-8)

    # Downsample for reasonable output size (every ~0.1s)
    step = max(1, int(0.1 * sr / hop_length))
    curve = [[float(times[i]), float(rms_norm[i])] for i in range(0, len(times), step)]

    return curve


def detect_sections(y: np.ndarray, sr: int, bpm: float) -> list:
    """
    Detect song sections using spectral novelty and structural analysis.
    Uses self-similarity matrix (SSM) and novelty function.
    """
    hop_length = 512

    # Compute features for structure analysis
    mfcc = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=13, hop_length=hop_length)
    chroma = librosa.feature.chroma_cqt(y=y, sr=sr, hop_length=hop_length)

    # Stack features
    features = np.vstack([mfcc, chroma])

    # Compute recurrence/self-similarity matrix
    rec = librosa.segment.recurrence_matrix(
        features, mode='affinity', sym=True, bandwidth=1.0
    )

    # Compute novelty curve from the recurrence matrix
    novelty = librosa.segment.novelty(rec)

    # Find peaks in novelty curve = section boundaries
    from scipy.signal import find_peaks
    peak_distance = int(4 * (60.0 / bpm) * sr / hop_length)  # Min 4 bars apart
    peaks, properties = find_peaks(novelty, distance=peak_distance, height=0.1)

    # Convert frame indices to times
    boundary_times = librosa.frames_to_time(peaks, sr=sr, hop_length=hop_length)

    # Add start and end
    duration = len(y) / sr
    boundaries = [0.0] + list(boundary_times) + [duration]

    # Compute energy per section to classify
    rms = librosa.feature.rms(y=y, hop_length=hop_length)[0]
    rms_norm = rms / (np.max(rms) + 1e-8)

    # Compute spectral centroid per section for brightness
    centroid = librosa.feature.spectral_centroid(y=y, sr=sr, hop_length=hop_length)[0]
    centroid_norm = centroid / (np.max(centroid) + 1e-8)

    sections = []
    beats_per_bar = 4
    seconds_per_beat = 60.0 / bpm

    for i in range(len(boundaries) - 1):
        start = boundaries[i]
        end = boundaries[i + 1]

        start_frame = librosa.time_to_frames(start, sr=sr, hop_length=hop_length)
        end_frame = librosa.time_to_frames(end, sr=sr, hop_length=hop_length)
        end_frame = min(end_frame, len(rms_norm) - 1)

        if start_frame >= end_frame:
            continue

        section_energy = float(np.mean(rms_norm[start_frame:end_frame]))
        section_brightness = float(np.mean(centroid_norm[start_frame:end_frame]))

        # Energy derivative (is it rising or falling?)
        if end_frame - start_frame > 2:
            energy_slope = float(
                np.polyfit(
                    np.arange(end_frame - start_frame),
                    rms_norm[start_frame:end_frame],
                    1
                )[0]
            )
        else:
            energy_slope = 0.0

        # Classify section based on energy, brightness, position, slope
        section_type = classify_section(
            section_energy, section_brightness, energy_slope,
            i, len(boundaries) - 1, (end - start)
        )

        start_bar = int(start / (seconds_per_beat * beats_per_bar)) + 1
        end_bar = int(end / (seconds_per_beat * beats_per_bar)) + 1

        sections.append({
            'id': str(uuid.uuid4())[:8],
            'type': section_type,
            'startTime': round(start, 3),
            'endTime': round(end, 3),
            'duration': round(end - start, 3),
            'startBar': start_bar,
            'endBar': end_bar,
            'energy': round(section_energy, 3),
        })

    return sections


def classify_section(
    energy: float,
    brightness: float,
    slope: float,
    index: int,
    total: int,
    duration: float,
) -> str:
    """Classify a section based on audio features and position."""
    position = index / max(total - 1, 1)

    # First section is usually intro
    if index == 0 and energy < 0.5:
        return 'intro'

    # Last section is usually outro
    if index == total - 1 and energy < 0.4:
        return 'outro'

    # High energy + high brightness = drop
    if energy > 0.7 and brightness > 0.5:
        return 'drop'

    # Rising energy = build
    if slope > 0.001 and energy > 0.3 and energy < 0.8:
        return 'build'

    # Low energy + low brightness = breakdown
    if energy < 0.3 and brightness < 0.4:
        return 'breakdown'

    # Medium energy in middle positions
    if energy > 0.4 and energy < 0.7:
        if position < 0.5:
            return 'verse'
        else:
            return 'chorus'

    # Transitional sections
    if slope < -0.001:
        return 'bridge'

    return 'verse'


def detect_transitions(sections: list) -> list:
    """Detect and classify transitions between sections."""
    transitions = []

    for i in range(len(sections) - 1):
        from_section = sections[i]
        to_section = sections[i + 1]

        energy_delta = to_section['energy'] - from_section['energy']
        abs_delta = abs(energy_delta)

        # Classify transition type
        if abs_delta > 0.5:
            if energy_delta > 0:
                t_type = 'cut'  # Sudden energy increase = hard cut (drop)
            else:
                t_type = 'silence'  # Sudden decrease
        elif energy_delta > 0.2:
            t_type = 'riser'
        elif energy_delta < -0.2:
            t_type = 'fade'
        elif abs_delta < 0.1:
            t_type = 'crossfade'
        else:
            t_type = 'filter'

        transitions.append({
            'id': str(uuid.uuid4())[:8],
            'fromSection': from_section['id'],
            'toSection': to_section['id'],
            'time': round(from_section['endTime'], 3),
            'type': t_type,
            'intensity': round(min(abs_delta * 2, 1.0), 3),
        })

    return transitions


def compute_spectral_profile(y: np.ndarray, sr: int, sections: list) -> dict:
    """Compute spectral characteristics per section."""
    hop_length = 512
    spec = np.abs(librosa.stft(y, hop_length=hop_length))
    freqs = librosa.fft_frequencies(sr=sr)

    # Define frequency bands
    bands = {
        'sub': (20, 80),
        'low': (80, 300),
        'mid': (300, 2000),
        'high': (2000, 6000),
        'presence': (6000, 20000),
    }

    dominant_bands = {}
    for section in sections:
        start_frame = librosa.time_to_frames(section['startTime'], sr=sr, hop_length=hop_length)
        end_frame = librosa.time_to_frames(section['endTime'], sr=sr, hop_length=hop_length)
        end_frame = min(end_frame, spec.shape[1] - 1)

        if start_frame >= end_frame:
            dominant_bands[section['id']] = 'mid'
            continue

        section_spec = spec[:, start_frame:end_frame]
        band_energies = {}

        for band_name, (lo, hi) in bands.items():
            mask = (freqs >= lo) & (freqs < hi)
            band_energies[band_name] = float(np.mean(section_spec[mask, :]))

        dominant_bands[section['id']] = max(band_energies, key=band_energies.get)

    # Overall brightness and warmth
    centroid = librosa.feature.spectral_centroid(y=y, sr=sr)[0]
    brightness = float(np.mean(centroid) / (sr / 2))
    warmth = 1.0 - brightness

    return {
        'dominantBands': dominant_bands,
        'brightness': round(brightness, 3),
        'warmth': round(warmth, 3),
    }


def extract_beat_grid(y: np.ndarray, sr: int, bpm: float) -> list:
    """Extract beat positions with energy levels."""
    hop_length = 512

    # Use librosa beat tracking
    tempo, beat_frames = librosa.beat.beat_track(y=y, sr=sr, bpm=bpm, hop_length=hop_length)
    beat_times = librosa.frames_to_time(beat_frames, sr=sr, hop_length=hop_length)

    # Compute energy at each beat
    rms = librosa.feature.rms(y=y, hop_length=hop_length)[0]
    rms_norm = rms / (np.max(rms) + 1e-8)

    beats = []
    for i, t in enumerate(beat_times):
        frame = librosa.time_to_frames(t, sr=sr, hop_length=hop_length)
        frame = min(frame, len(rms_norm) - 1)

        beat_in_bar = (i % 4) + 1  # Assuming 4/4

        beats.append({
            'time': round(float(t), 4),
            'beatInBar': beat_in_bar,
            'isDownbeat': beat_in_bar == 1,
            'energy': round(float(rms_norm[frame]), 3),
        })

    return beats


def analyze(audio_path: str) -> dict:
    """Main analysis pipeline."""
    print(f"Loading audio: {audio_path}", file=sys.stderr)
    y, sr = librosa.load(audio_path, sr=22050, mono=True)
    duration = len(y) / sr

    print("Detecting tempo...", file=sys.stderr)
    tempo, _ = librosa.beat.beat_track(y=y, sr=sr)
    bpm = float(np.atleast_1d(tempo)[0])

    print("Detecting key...", file=sys.stderr)
    key = detect_key(y, sr)

    print("Extracting beat grid...", file=sys.stderr)
    beats = extract_beat_grid(y, sr, bpm)

    print("Detecting song sections...", file=sys.stderr)
    sections = detect_sections(y, sr, bpm)

    # Assign beats to sections
    for section in sections:
        section['beats'] = [
            b for b in beats
            if section['startTime'] <= b['time'] < section['endTime']
        ]

    print("Detecting transitions...", file=sys.stderr)
    transitions = detect_transitions(sections)

    print("Computing energy curve...", file=sys.stderr)
    energy_curve = compute_energy_curve(y, sr)

    print("Computing spectral profile...", file=sys.stderr)
    spectral_profile = compute_spectral_profile(y, sr, sections)

    result = {
        'audioSource': audio_path,
        'bpm': round(bpm, 1),
        'key': key,
        'duration': round(duration, 3),
        'timeSignature': '4/4',
        'beats': beats,
        'sections': sections,
        'transitions': transitions,
        'energyCurve': energy_curve,
        'spectralProfile': spectral_profile,
    }

    print(f"Analysis complete: {len(sections)} sections, {len(transitions)} transitions, {len(beats)} beats", file=sys.stderr)
    return result


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Usage: python analyze_audio.py <audio_file> [--output <json_file>]", file=sys.stderr)
        sys.exit(1)

    audio_file = sys.argv[1]

    if not Path(audio_file).exists():
        print(f"Error: File not found: {audio_file}", file=sys.stderr)
        sys.exit(1)

    output_file = None
    if '--output' in sys.argv:
        idx = sys.argv.index('--output')
        if idx + 1 < len(sys.argv):
            output_file = sys.argv[idx + 1]

    result = analyze(audio_file)

    json_output = json.dumps(result, indent=2)

    if output_file:
        Path(output_file).write_text(json_output)
        print(f"Results written to: {output_file}", file=sys.stderr)
    else:
        print(json_output)

/**
 * Pitch detection using autocorrelation (YIN-like algorithm).
 * Returns frequency, confidence, and RMS energy (used for velocity extraction).
 */

export interface PitchResult {
  frequency: number;
  confidence: number;
  rms: number; // 0-1 normalized signal energy
}

export class PitchDetector {
  private sampleRate: number = 44100;
  private readonly CONFIDENCE_THRESHOLD = 0.65; // lowered from 0.8 to catch vibrato/breathy input

  initialize(sampleRate: number): void {
    this.sampleRate = sampleRate;
  }

  detectPitch(buffer: Float32Array): PitchResult | null {
    const rms = this.computeRms(buffer);

    // Silence gate — skip if signal energy is too low
    if (rms < 0.01) return null;

    const result = this.autoCorrelate(buffer, this.sampleRate);
    if (result.frequency === -1 || result.confidence < this.CONFIDENCE_THRESHOLD) {
      return null;
    }

    return {
      frequency: result.frequency,
      confidence: result.confidence,
      rms: Math.min(rms * 4, 1), // normalize to 0-1 range
    };
  }

  private computeRms(buffer: Float32Array): number {
    let sum = 0;
    for (let i = 0; i < buffer.length; i++) {
      sum += buffer[i] * buffer[i];
    }
    return Math.sqrt(sum / buffer.length);
  }

  private autoCorrelate(
    buffer: Float32Array,
    sampleRate: number,
  ): { frequency: number; confidence: number } {
    const SIZE = buffer.length;

    // Autocorrelation
    const correlations = new Float32Array(SIZE);
    for (let lag = 0; lag < SIZE; lag++) {
      let sum = 0;
      for (let i = 0; i < SIZE - lag; i++) {
        sum += buffer[i] * buffer[i + lag];
      }
      correlations[lag] = sum;
    }

    if (correlations[0] === 0) return { frequency: -1, confidence: 0 };

    // Find the first dip (zero crossing) then the next peak
    let d = 0;
    while (d < SIZE && correlations[d] > 0) d++;

    if (d >= SIZE) return { frequency: -1, confidence: 0 };

    let maxVal = -1;
    let maxPos = -1;
    for (let i = d; i < SIZE; i++) {
      if (correlations[i] > maxVal) {
        maxVal = correlations[i];
        maxPos = i;
      }
    }

    if (maxPos <= 0) return { frequency: -1, confidence: 0 };

    // Parabolic interpolation for sub-sample precision
    const prev = maxPos > 0 ? correlations[maxPos - 1] : correlations[maxPos];
    const curr = correlations[maxPos];
    const next = maxPos < SIZE - 1 ? correlations[maxPos + 1] : correlations[maxPos];
    const denom = 2 * curr - prev - next;
    const shift = denom !== 0 ? (next - prev) / (2 * denom) : 0;
    const refinedPos = maxPos + (isFinite(shift) ? shift : 0);

    if (refinedPos <= 0) return { frequency: -1, confidence: 0 };

    const frequency = sampleRate / refinedPos;
    const confidence = maxVal / correlations[0];

    // Only return frequencies in human singing range (roughly 80-1000Hz)
    if (frequency < 80 || frequency > 1000) {
      return { frequency: -1, confidence: 0 };
    }

    return { frequency, confidence: Math.min(confidence, 1) };
  }

  frequencyToMidi(frequency: number): number {
    return Math.round(69 + 12 * Math.log2(frequency / 440));
  }

  dispose(): void {
    // No cleanup needed for autocorrelation
  }
}

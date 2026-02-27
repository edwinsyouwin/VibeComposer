/**
 * Pitch detection using autocorrelation (YIN-like algorithm).
 * This avoids the heavy TensorFlow.js dependency for MVP while still providing
 * reasonable pitch detection for monophonic humming/singing.
 */

export class PitchDetector {
  private sampleRate: number = 44100;
  private readonly CONFIDENCE_THRESHOLD = 0.8;

  initialize(sampleRate: number): void {
    this.sampleRate = sampleRate;
  }

  detectPitch(
    buffer: Float32Array,
  ): { frequency: number; confidence: number } | null {
    const result = this.autoCorrelate(buffer, this.sampleRate);
    if (result.frequency === -1 || result.confidence < this.CONFIDENCE_THRESHOLD) {
      return null;
    }
    return { frequency: result.frequency, confidence: result.confidence };
  }

  private autoCorrelate(
    buffer: Float32Array,
    sampleRate: number,
  ): { frequency: number; confidence: number } {
    const SIZE = buffer.length;

    // Check if signal has enough energy
    let rms = 0;
    for (let i = 0; i < SIZE; i++) {
      rms += buffer[i] * buffer[i];
    }
    rms = Math.sqrt(rms / SIZE);
    if (rms < 0.01) return { frequency: -1, confidence: 0 };

    // Autocorrelation
    const correlations = new Float32Array(SIZE);
    for (let lag = 0; lag < SIZE; lag++) {
      let sum = 0;
      for (let i = 0; i < SIZE - lag; i++) {
        sum += buffer[i] * buffer[i + lag];
      }
      correlations[lag] = sum;
    }

    // Find the first dip then the next peak
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

    if (maxPos === -1) return { frequency: -1, confidence: 0 };

    // Parabolic interpolation for better precision
    const y1 = correlations[maxPos - 1] || 0;
    const y2 = correlations[maxPos];
    const y3 = correlations[maxPos + 1] || 0;
    const shift = (y3 - y1) / (2 * (2 * y2 - y1 - y3));
    const refinedPos = maxPos + (isFinite(shift) ? shift : 0);

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

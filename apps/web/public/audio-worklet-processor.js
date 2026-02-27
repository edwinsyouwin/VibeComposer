/**
 * AudioWorklet processor that captures audio chunks from the microphone
 * and sends them to the main thread via MessagePort.
 *
 * This replaces the deprecated ScriptProcessorNode.
 */
class CaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._active = true;
    this.port.onmessage = (event) => {
      if (event.data === 'stop') {
        this._active = false;
      }
    };
  }

  process(inputs) {
    if (!this._active) return false;

    const input = inputs[0];
    if (input && input[0] && input[0].length > 0) {
      // Copy the buffer so it survives across thread boundaries
      const buffer = new Float32Array(input[0]);
      this.port.postMessage({ buffer, timestamp: currentTime * 1000 });
    }

    return true; // keep processor alive
  }
}

registerProcessor('capture-processor', CaptureProcessor);

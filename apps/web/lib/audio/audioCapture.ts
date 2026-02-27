type AudioChunkCallback = (buffer: Float32Array, timestamp: number) => void;

export class AudioCapture {
  private context: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private analyser: AnalyserNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;

  // AudioWorklet (preferred)
  private workletNode: AudioWorkletNode | null = null;
  // ScriptProcessor (fallback for browsers without AudioWorklet)
  private scriptNode: ScriptProcessorNode | null = null;

  private readonly BUFFER_SIZE = 2048;
  private readonly SAMPLE_RATE = 44100;
  private useWorklet = false;

  getContext(): AudioContext | null {
    return this.context;
  }

  getSource(): MediaStreamAudioSourceNode | null {
    return this.source;
  }

  getActualSampleRate(): number {
    return this.context?.sampleRate ?? this.SAMPLE_RATE;
  }

  async initialize(): Promise<void> {
    this.context = new AudioContext({ sampleRate: this.SAMPLE_RATE });
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        sampleRate: this.SAMPLE_RATE,
      },
    });

    this.source = this.context.createMediaStreamSource(this.stream);
    this.analyser = this.context.createAnalyser();
    this.analyser.fftSize = this.BUFFER_SIZE * 2;
    this.source.connect(this.analyser);

    // Try to register AudioWorklet
    try {
      await this.context.audioWorklet.addModule('/audio-worklet-processor.js');
      this.useWorklet = true;
    } catch {
      // AudioWorklet not available — will fall back to ScriptProcessorNode
      this.useWorklet = false;
    }
  }

  startCapture(onAudioChunk: AudioChunkCallback): void {
    if (!this.context || !this.source) throw new Error('Not initialized');

    if (this.useWorklet) {
      this.startWorkletCapture(onAudioChunk);
    } else {
      this.startScriptProcessorCapture(onAudioChunk);
    }
  }

  private startWorkletCapture(onAudioChunk: AudioChunkCallback): void {
    this.workletNode = new AudioWorkletNode(this.context!, 'capture-processor', {
      numberOfInputs: 1,
      numberOfOutputs: 0,
      channelCount: 1,
    });

    this.workletNode.port.onmessage = (event: MessageEvent) => {
      const { buffer, timestamp } = event.data;
      if (buffer) {
        onAudioChunk(new Float32Array(buffer), timestamp);
      }
    };

    this.source!.connect(this.workletNode);
  }

  private startScriptProcessorCapture(onAudioChunk: AudioChunkCallback): void {
    this.scriptNode = this.context!.createScriptProcessor(
      this.BUFFER_SIZE,
      1,
      1,
    );
    this.scriptNode.onaudioprocess = (e) => {
      const buffer = e.inputBuffer.getChannelData(0).slice();
      onAudioChunk(buffer, this.context!.currentTime * 1000);
    };

    this.source!.connect(this.scriptNode);
    this.scriptNode.connect(this.context!.destination);
  }

  getVolumeLevel(): number {
    if (!this.analyser) return 0;
    const data = new Float32Array(this.analyser.fftSize);
    this.analyser.getFloatTimeDomainData(data);
    const rms = Math.sqrt(
      data.reduce((sum, v) => sum + v * v, 0) / data.length,
    );
    return Math.min(rms * 4, 1);
  }

  stop(): void {
    // Stop the worklet
    if (this.workletNode) {
      this.workletNode.port.postMessage('stop');
      this.workletNode.disconnect();
      this.workletNode = null;
    }

    // Stop the script processor fallback
    if (this.scriptNode) {
      this.scriptNode.disconnect();
      this.scriptNode = null;
    }

    this.stream?.getTracks().forEach((t) => t.stop());
    this.context?.close();
    this.context = null;
    this.stream = null;
    this.source = null;
    this.analyser = null;
  }
}

export class AudioCapture {
  private context: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private analyser: AnalyserNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private workletNode: ScriptProcessorNode | null = null;

  private readonly BUFFER_SIZE = 2048;
  private readonly SAMPLE_RATE = 44100;

  getContext(): AudioContext | null {
    return this.context;
  }

  getSource(): MediaStreamAudioSourceNode | null {
    return this.source;
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
  }

  startCapture(
    onAudioChunk: (buffer: Float32Array, timestamp: number) => void,
  ): void {
    if (!this.context || !this.source) throw new Error('Not initialized');

    this.workletNode = this.context.createScriptProcessor(
      this.BUFFER_SIZE,
      1,
      1,
    );
    this.workletNode.onaudioprocess = (e) => {
      const buffer = e.inputBuffer.getChannelData(0).slice();
      onAudioChunk(buffer, this.context!.currentTime * 1000);
    };

    this.source.connect(this.workletNode);
    this.workletNode.connect(this.context.destination);
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
    this.workletNode?.disconnect();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.context?.close();
    this.context = null;
    this.stream = null;
    this.source = null;
    this.analyser = null;
    this.workletNode = null;
  }
}

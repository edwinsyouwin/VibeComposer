import type { GenerateClipRequest, GenerateClipResponse, VideoProviderConfig, VideoProvider } from '../types.js';

/**
 * Abstract interface for video generation providers.
 * Each provider (Seedance, Runway, Kling, etc.) implements this.
 */
export interface IVideoProvider {
  readonly name: VideoProvider;

  /** Submit a clip generation request. Returns immediately with a job ID. */
  generateClip(request: GenerateClipRequest): Promise<GenerateClipResponse>;

  /** Poll the status of a generation job. */
  getStatus(jobId: string): Promise<GenerateClipResponse>;

  /** Cancel a pending generation. */
  cancel(jobId: string): Promise<void>;

  /** Maximum clip duration this provider supports (seconds). */
  maxDuration(): number;

  /** Supported resolutions. */
  supportedResolutions(): string[];
}

/**
 * Create a video provider instance based on config.
 */
export async function createProvider(config: VideoProviderConfig): Promise<IVideoProvider> {
  switch (config.provider) {
    case 'seedance': {
      const { SeedanceProvider } = await import('./providers/seedance.js');
      return new SeedanceProvider(config.apiKey, config.baseUrl);
    }
    case 'runway': {
      const { RunwayProvider } = await import('./providers/runway.js');
      return new RunwayProvider(config.apiKey, config.baseUrl);
    }
    case 'kling': {
      const { KlingProvider } = await import('./providers/kling.js');
      return new KlingProvider(config.apiKey, config.baseUrl);
    }
    default:
      throw new Error(`Unsupported video provider: ${config.provider}`);
  }
}

/**
 * Poll a provider for job completion with exponential backoff.
 */
export async function pollUntilComplete(
  provider: IVideoProvider,
  jobId: string,
  maxWaitMs: number = 300_000, // 5 minutes
  onProgress?: (status: GenerateClipResponse) => void,
): Promise<GenerateClipResponse> {
  const startTime = Date.now();
  let delay = 2000;

  while (Date.now() - startTime < maxWaitMs) {
    const status = await provider.getStatus(jobId);
    onProgress?.(status);

    if (status.status === 'completed' || status.status === 'failed') {
      return status;
    }

    await new Promise(resolve => setTimeout(resolve, delay));
    delay = Math.min(delay * 1.5, 15_000);
  }

  throw new Error(`Generation timed out after ${maxWaitMs}ms for job ${jobId}`);
}

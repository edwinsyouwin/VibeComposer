import type { GenerateClipRequest, GenerateClipResponse, VideoProvider } from '../../types.js';
import type { IVideoProvider } from '../videoProvider.js';

const DEFAULT_BASE_URL = 'https://api.dev.runwayml.com/v1';

/**
 * Runway Gen-3/Gen-4 video generation provider.
 * Supports text-to-video and image-to-video with camera control.
 */
export class RunwayProvider implements IVideoProvider {
  readonly name: VideoProvider = 'runway';
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey: string, baseUrl?: string) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl || DEFAULT_BASE_URL;
  }

  async generateClip(request: GenerateClipRequest): Promise<GenerateClipResponse> {
    const body: Record<string, unknown> = {
      promptText: request.prompt,
      duration: Math.min(request.duration, 10),
      ratio: this.mapAspectRatio(request.aspectRatio),
      ...request.style,
    };

    if (request.referenceImage) {
      body.promptImage = request.referenceImage;
    }

    const response = await fetch(`${this.baseUrl}/image_to_video`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
        'X-Runway-Version': '2024-11-06',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Runway API error (${response.status}): ${errorText}`);
    }

    const data = await response.json() as { id: string };

    return {
      id: data.id,
      status: 'queued',
    };
  }

  async getStatus(jobId: string): Promise<GenerateClipResponse> {
    const response = await fetch(`${this.baseUrl}/tasks/${jobId}`, {
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'X-Runway-Version': '2024-11-06',
      },
    });

    if (!response.ok) {
      throw new Error(`Runway status check failed: ${response.status}`);
    }

    const data = await response.json() as {
      id: string;
      status: string;
      output?: string[];
      failure?: string;
    };

    return {
      id: data.id,
      status: this.mapStatus(data.status),
      clipUrl: data.output?.[0],
      error: data.failure,
    };
  }

  async cancel(jobId: string): Promise<void> {
    await fetch(`${this.baseUrl}/tasks/${jobId}/cancel`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'X-Runway-Version': '2024-11-06',
      },
    });
  }

  maxDuration(): number {
    return 10;
  }

  supportedResolutions(): string[] {
    return ['720p', '1080p'];
  }

  private mapAspectRatio(ratio: string): string {
    const map: Record<string, string> = {
      '16:9': '1280:768',
      '9:16': '768:1280',
      '4:3': '1024:768',
      '1:1': '768:768',
    };
    return map[ratio] || '1280:768';
  }

  private mapStatus(status: string): GenerateClipResponse['status'] {
    const map: Record<string, GenerateClipResponse['status']> = {
      PENDING: 'queued',
      THROTTLED: 'queued',
      RUNNING: 'processing',
      SUCCEEDED: 'completed',
      FAILED: 'failed',
    };
    return map[status] || 'processing';
  }
}

import type { GenerateClipRequest, GenerateClipResponse, VideoProvider } from '../../types.js';
import type { IVideoProvider } from '../videoProvider.js';

const DEFAULT_BASE_URL = 'https://api.seedance.ai/v2';

/**
 * Seedance (ByteDance) video generation provider.
 * Supports text-to-video and image-to-video generation.
 * Seedance 2.0 generates up to 15s clips with native audio.
 */
export class SeedanceProvider implements IVideoProvider {
  readonly name: VideoProvider = 'seedance';
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey: string, baseUrl?: string) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl || DEFAULT_BASE_URL;
  }

  async generateClip(request: GenerateClipRequest): Promise<GenerateClipResponse> {
    const endpoint = request.referenceImage
      ? `${this.baseUrl}/image-to-video`
      : `${this.baseUrl}/text-to-video`;

    const body: Record<string, unknown> = {
      prompt: request.prompt,
      duration: Math.min(request.duration, 15),
      resolution: this.mapResolution(request.resolution),
      aspect_ratio: request.aspectRatio,
      ...request.style,
    };

    if (request.referenceImage) {
      body.image_url = request.referenceImage;
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Seedance API error (${response.status}): ${errorText}`);
    }

    const data = await response.json() as { id: string; status: string; estimated_time?: number };

    return {
      id: data.id,
      status: 'queued',
      estimatedTime: data.estimated_time,
    };
  }

  async getStatus(jobId: string): Promise<GenerateClipResponse> {
    const response = await fetch(`${this.baseUrl}/jobs/${jobId}`, {
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Seedance status check failed: ${response.status}`);
    }

    const data = await response.json() as {
      id: string;
      status: string;
      video_url?: string;
      error?: string;
    };

    return {
      id: data.id,
      status: this.mapStatus(data.status),
      clipUrl: data.video_url,
      error: data.error,
    };
  }

  async cancel(jobId: string): Promise<void> {
    await fetch(`${this.baseUrl}/jobs/${jobId}/cancel`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
      },
    });
  }

  maxDuration(): number {
    return 15;
  }

  supportedResolutions(): string[] {
    return ['480p', '720p', '1080p'];
  }

  private mapResolution(resolution: string): string {
    const map: Record<string, string> = {
      '480p': '480p',
      '720p': '720p',
      '1080p': '1080p',
    };
    return map[resolution] || '720p';
  }

  private mapStatus(status: string): GenerateClipResponse['status'] {
    const map: Record<string, GenerateClipResponse['status']> = {
      queued: 'queued',
      pending: 'queued',
      processing: 'processing',
      generating: 'processing',
      completed: 'completed',
      done: 'completed',
      failed: 'failed',
      error: 'failed',
    };
    return map[status] || 'processing';
  }
}

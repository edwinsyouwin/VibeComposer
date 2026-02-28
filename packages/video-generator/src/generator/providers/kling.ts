import type { GenerateClipRequest, GenerateClipResponse, VideoProvider } from '../../types.js';
import type { IVideoProvider } from '../videoProvider.js';

const DEFAULT_BASE_URL = 'https://api.wavespeed.ai/v1/kling';

/**
 * Kling (Kuaishou) video generation provider via WaveSpeedAI.
 * Supports up to 2-minute videos at 1080p.
 * Kling 2.6+ supports simultaneous audio-visual generation.
 */
export class KlingProvider implements IVideoProvider {
  readonly name: VideoProvider = 'kling';
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey: string, baseUrl?: string) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl || DEFAULT_BASE_URL;
  }

  async generateClip(request: GenerateClipRequest): Promise<GenerateClipResponse> {
    const body: Record<string, unknown> = {
      prompt: request.prompt,
      duration: Math.min(request.duration, 10),
      resolution: request.resolution,
      aspect_ratio: request.aspectRatio,
      mode: 'standard',
      ...request.style,
    };

    if (request.referenceImage) {
      body.image_url = request.referenceImage;
    }

    const response = await fetch(`${this.baseUrl}/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Kling API error (${response.status}): ${errorText}`);
    }

    const data = await response.json() as { task_id: string; estimated_time?: number };

    return {
      id: data.task_id,
      status: 'queued',
      estimatedTime: data.estimated_time,
    };
  }

  async getStatus(jobId: string): Promise<GenerateClipResponse> {
    const response = await fetch(`${this.baseUrl}/tasks/${jobId}`, {
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Kling status check failed: ${response.status}`);
    }

    const data = await response.json() as {
      task_id: string;
      status: string;
      video_url?: string;
      error_message?: string;
    };

    return {
      id: data.task_id,
      status: this.mapStatus(data.status),
      clipUrl: data.video_url,
      error: data.error_message,
    };
  }

  async cancel(jobId: string): Promise<void> {
    await fetch(`${this.baseUrl}/tasks/${jobId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
      },
    });
  }

  maxDuration(): number {
    return 10;
  }

  supportedResolutions(): string[] {
    return ['480p', '720p', '1080p'];
  }

  private mapStatus(status: string): GenerateClipResponse['status'] {
    const map: Record<string, GenerateClipResponse['status']> = {
      queued: 'queued',
      pending: 'queued',
      processing: 'processing',
      running: 'processing',
      completed: 'completed',
      success: 'completed',
      failed: 'failed',
      error: 'failed',
    };
    return map[status] || 'processing';
  }
}

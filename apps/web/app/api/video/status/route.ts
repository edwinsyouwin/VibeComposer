import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/video/status?provider=seedance&jobId=xxx&apiKey=xxx
 * Poll the status of a video generation job.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const provider = searchParams.get('provider');
  const jobId = searchParams.get('jobId');
  const apiKey = searchParams.get('apiKey');

  if (!provider || !jobId || !apiKey) {
    return NextResponse.json(
      { error: 'Missing required params: provider, jobId, apiKey' },
      { status: 400 },
    );
  }

  try {
    const providerUrls: Record<string, string> = {
      seedance: 'https://api.seedance.ai/v2',
      runway: 'https://api.dev.runwayml.com/v1',
      kling: 'https://api.wavespeed.ai/v1/kling',
    };

    const baseUrl = providerUrls[provider];
    if (!baseUrl) {
      return NextResponse.json({ error: `Unknown provider: ${provider}` }, { status: 400 });
    }

    let statusUrl: string;
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${apiKey}`,
    };

    switch (provider) {
      case 'seedance':
        statusUrl = `${baseUrl}/jobs/${jobId}`;
        break;
      case 'runway':
        statusUrl = `${baseUrl}/tasks/${jobId}`;
        headers['X-Runway-Version'] = '2024-11-06';
        break;
      case 'kling':
        statusUrl = `${baseUrl}/tasks/${jobId}`;
        break;
      default:
        throw new Error(`Unsupported provider: ${provider}`);
    }

    const response = await fetch(statusUrl, { headers });

    if (!response.ok) {
      throw new Error(`Status check failed: ${response.status}`);
    }

    const data = await response.json();

    // Normalize status response
    const normalizedStatus = normalizeStatus(provider, data);

    return NextResponse.json(normalizedStatus);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Status check failed' },
      { status: 500 },
    );
  }
}

function normalizeStatus(provider: string, data: Record<string, unknown>): {
  id: string;
  status: string;
  clipUrl?: string;
  error?: string;
  progress?: number;
} {
  switch (provider) {
    case 'seedance':
      return {
        id: data.id as string,
        status: mapStatus(data.status as string),
        clipUrl: data.video_url as string | undefined,
        error: data.error as string | undefined,
      };

    case 'runway':
      return {
        id: data.id as string,
        status: mapStatus(data.status as string),
        clipUrl: (data.output as string[] | undefined)?.[0],
        error: data.failure as string | undefined,
        progress: data.progress as number | undefined,
      };

    case 'kling':
      return {
        id: (data.task_id || data.id) as string,
        status: mapStatus(data.status as string),
        clipUrl: data.video_url as string | undefined,
        error: data.error_message as string | undefined,
      };

    default:
      return {
        id: data.id as string || '',
        status: 'unknown',
      };
  }
}

function mapStatus(raw: string): string {
  const statusMap: Record<string, string> = {
    queued: 'queued',
    pending: 'queued',
    PENDING: 'queued',
    THROTTLED: 'queued',
    processing: 'processing',
    generating: 'processing',
    RUNNING: 'processing',
    running: 'processing',
    completed: 'completed',
    done: 'completed',
    SUCCEEDED: 'completed',
    success: 'completed',
    failed: 'failed',
    error: 'failed',
    FAILED: 'failed',
  };

  return statusMap[raw] || 'processing';
}

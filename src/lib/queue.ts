import type { JobStatus } from '@/types';

export interface QueueLimits { dailyVideoLimit: number }

export function queueLimitsFromEnv(): QueueLimits {
  return { dailyVideoLimit: Number(process.env.DAILY_VIDEO_LIMIT ?? 40) };
}

// Sem teto de gasto por decisão de produto (spec 2026-07-31): o único
// limitador de despacho é a quantidade diária de vídeos.
export function dispatchAllowance(
  state: { videosToday: number },
  limits: QueueLimits,
): number {
  return Math.max(0, limits.dailyVideoLimit - state.videosToday);
}

export type JobAction =
  | { kind: 'compose' }
  | { kind: 'animate' }
  | { kind: 'retry'; to: 'queued' | 'ready' }
  | { kind: 'none' };

const MAX_RETRIES = 3;

export function nextAction(job: {
  status: JobStatus; retry_count: number; composed_image_url: string | null;
}): JobAction {
  if (job.status === 'queued') return { kind: 'compose' };
  if (job.status === 'ready') return { kind: 'animate' };
  if (job.status === 'failed' && job.retry_count < MAX_RETRIES) {
    return { kind: 'retry', to: job.composed_image_url ? 'ready' : 'queued' };
  }
  return { kind: 'none' };
}

import type { JobStatus } from '@/types';

export interface QueueLimits { dailyVideoLimit: number; dailyCostLimitUsd: number }

export function queueLimitsFromEnv(): QueueLimits {
  return {
    dailyVideoLimit: Number(process.env.DAILY_VIDEO_LIMIT ?? 40),
    dailyCostLimitUsd: Number(process.env.DAILY_COST_LIMIT_USD ?? 20),
  };
}

export function dispatchAllowance(
  state: { videosToday: number; costTodayUsd: number },
  limits: QueueLimits,
  perVideoCostUsd: number,
): number {
  const byCount = limits.dailyVideoLimit - state.videosToday;
  const byCost = Math.floor((limits.dailyCostLimitUsd - state.costTodayUsd) / perVideoCostUsd);
  return Math.max(0, Math.min(byCount, byCost));
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

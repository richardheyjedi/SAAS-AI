import { describe, it, expect } from 'vitest';
import { dispatchAllowance, nextAction } from '@/lib/queue';

const limits = { dailyVideoLimit: 40, dailyCostLimitUsd: 20 };

describe('dispatchAllowance', () => {
  it('limita pelo teto diário de vídeos', () => {
    expect(dispatchAllowance({ videosToday: 38, costTodayUsd: 0 }, limits, 0.45)).toBe(2);
  });
  it('limita pelo teto de custo', () => {
    expect(dispatchAllowance({ videosToday: 0, costTodayUsd: 19.2 }, limits, 0.45)).toBe(1);
  });
  it('nunca retorna negativo', () => {
    expect(dispatchAllowance({ videosToday: 41, costTodayUsd: 30 }, limits, 0.45)).toBe(0);
  });
});

describe('nextAction', () => {
  it('queued compõe imagem; ready anima', () => {
    expect(nextAction({ status: 'queued', retry_count: 0, composed_image_url: null })).toEqual({ kind: 'compose' });
    expect(nextAction({ status: 'ready', retry_count: 0, composed_image_url: 'https://x/i.png' })).toEqual({ kind: 'animate' });
  });
  it('failed com retry disponível volta para a fase certa', () => {
    expect(nextAction({ status: 'failed', retry_count: 1, composed_image_url: null })).toEqual({ kind: 'retry', to: 'queued' });
    expect(nextAction({ status: 'failed', retry_count: 2, composed_image_url: 'https://x/i.png' })).toEqual({ kind: 'retry', to: 'ready' });
  });
  it('failed com 3 retries e estados terminais/em andamento ficam parados', () => {
    expect(nextAction({ status: 'failed', retry_count: 3, composed_image_url: null })).toEqual({ kind: 'none' });
    expect(nextAction({ status: 'generating', retry_count: 0, composed_image_url: 'u' })).toEqual({ kind: 'none' });
    expect(nextAction({ status: 'completed', retry_count: 0, composed_image_url: 'u' })).toEqual({ kind: 'none' });
  });
});

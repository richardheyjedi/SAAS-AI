import { describe, it, expect } from 'vitest';
import { dispatchAllowance, nextAction } from '@/lib/queue';

const limits = { dailyVideoLimit: 40 };

describe('dispatchAllowance', () => {
  it('limita apenas pelo teto diário de vídeos', () => {
    expect(dispatchAllowance({ videosToday: 38 }, limits)).toBe(2);
    expect(dispatchAllowance({ videosToday: 0 }, limits)).toBe(40);
  });
  it('nunca retorna negativo', () => {
    expect(dispatchAllowance({ videosToday: 41 }, limits)).toBe(0);
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

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateImage, generateVideo, parseWebhook, type MuApiConfig } from '@/lib/muapi';

const cfg: MuApiConfig = { apiKey: 'k', baseUrl: 'https://api.test', webhookUrl: 'https://app/api/webhooks/muapi' };

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ request_id: 'req_1' }), { status: 200 })));
});

describe('generateImage', () => {
  it('faz POST no endpoint de imagem com api key e webhook', async () => {
    const r = await generateImage(cfg, { prompt: 'foto', imageUrls: ['https://x/1.png'] });
    expect(r.requestId).toBe('req_1');
    const call = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(String(call[0])).toContain('https://api.test');
    const init = call[1] as RequestInit;
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['x-api-key']).toBe('k');
    const body = JSON.parse(String(init.body));
    expect(body.webhook_url).toBe(cfg.webhookUrl);
  });
  it('lança erro em resposta não-2xx', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 402 })));
    await expect(generateImage(cfg, { prompt: 'x' })).rejects.toThrow(/MuAPI 402/);
  });
});

describe('generateVideo', () => {
  it('envia image_url, prompt e duration', async () => {
    await generateVideo(cfg, { imageUrl: 'https://x/base.png', prompt: 'mexe', durationSeconds: 5 });
    const init = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][1] as RequestInit;
    const body = JSON.parse(String(init.body));
    expect(body.image_url).toBe('https://x/base.png');
    expect(body.duration).toBe(5);
  });
});

describe('parseWebhook', () => {
  it('normaliza payload de sucesso', () => {
    const r = parseWebhook({ request_id: 'req_9', status: 'completed', outputs: ['https://cdn/v.mp4'] });
    expect(r).toEqual({ requestId: 'req_9', status: 'completed', outputUrl: 'https://cdn/v.mp4', error: undefined });
  });
  it('normaliza falha e rejeita payload sem request_id', () => {
    expect(parseWebhook({ request_id: 'r', status: 'failed', error: 'nsfw' }).error).toBe('nsfw');
    expect(() => parseWebhook({ status: 'completed' })).toThrow();
  });
});

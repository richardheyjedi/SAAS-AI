import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateImage, generateVideo, parseWebhook, type MuApiConfig } from '@/lib/muapi';

const cfg: MuApiConfig = { apiKey: 'k', baseUrl: 'https://api.test', webhookUrl: 'https://app/api/webhooks/muapi?secret=s' };

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ request_id: 'req_1' }), { status: 200 })));
});

const lastCall = () => (fetch as ReturnType<typeof vi.fn>).mock.calls[0];

describe('generateImage', () => {
  it('sem imagens usa o t2i do motor, com api key e webhook na query', async () => {
    const r = await generateImage(cfg, { engineId: 'gpt-image-2', prompt: 'foto' });
    expect(r.requestId).toBe('req_1');
    const [url, init] = lastCall() as [string, RequestInit];
    expect(String(url)).toContain('/api/v1/gpt-image-2-text-to-image');
    expect(String(url)).toContain(`webhook=${encodeURIComponent(cfg.webhookUrl)}`);
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['x-api-key']).toBe('k');
    const body = JSON.parse(String(init.body));
    expect(body.aspect_ratio).toBe('9:16');
  });
  it('nano-banana-2 com imagens usa o endpoint -edit', async () => {
    await generateImage(cfg, { engineId: 'nano-banana-2', prompt: 'compor', imageUrls: ['https://x/1.png'] });
    const [url, init] = lastCall() as [string, RequestInit];
    expect(String(url)).toContain('/api/v1/nano-banana-2-edit');
    expect(JSON.parse(String(init.body)).images_list).toEqual(['https://x/1.png']);
  });
  it('gpt-image-2 com imagens usa image-to-image', async () => {
    await generateImage(cfg, { engineId: 'gpt-image-2', prompt: 'compor', imageUrls: ['https://x/1.png'] });
    expect(String(lastCall()[0])).toContain('/api/v1/gpt-image-2-image-to-image');
  });
  it('motor desconhecido lança de forma síncrona, sem chamar a rede', () => {
    // imageEngine() lança antes do submit — o throw é síncrono, não uma Promise rejeitada.
    expect(() => generateImage(cfg, { engineId: 'dall-e', prompt: 'x' })).toThrow(/desconhecido/);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('aceita resposta com id no lugar de request_id', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ id: 'task_7' }), { status: 200 })));
    const r = await generateImage(cfg, { engineId: 'gpt-image-2', prompt: 'x' });
    expect(r.requestId).toBe('task_7');
  });
  it('lança erro em resposta não-2xx', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 402 })));
    await expect(generateImage(cfg, { engineId: 'gpt-image-2', prompt: 'x' })).rejects.toThrow(/MuAPI 402/);
  });
});

describe('generateVideo', () => {
  it('mini envia images_list, duration, resolution 720p, som ligado e 9:16 por padrão', async () => {
    await generateVideo(cfg, { engineId: 'seedance-2-mini-image-to-video', imageUrl: 'https://x/base.png', prompt: 'mexe', durationSeconds: 5 });
    const [url, init] = lastCall() as [string, RequestInit];
    expect(String(url)).toContain('/api/v1/seedance-2-mini-image-to-video');
    const body = JSON.parse(String(init.body));
    expect(body.images_list).toEqual(['https://x/base.png']);
    expect(body.duration).toBe(5);
    expect(body.resolution).toBe('720p');
    expect(body.generate_audio).toBe(true);
    expect(body.aspect_ratio).toBe('9:16');
  });
  it('controles do lote chegam ao payload do mini: sem som, 480p, 16:9, alta fidelidade, 12s', async () => {
    await generateVideo(cfg, {
      engineId: 'seedance-2-mini-image-to-video', imageUrl: 'https://x/b.png', prompt: 'm',
      durationSeconds: 12, generateAudio: false, resolution: '480p', aspectRatio: '16:9', highBitrate: true,
    });
    const body = JSON.parse(String((lastCall() as [string, RequestInit])[1].body));
    expect(body.generate_audio).toBe(false);
    expect(body.resolution).toBe('480p');
    expect(body.aspect_ratio).toBe('16:9');
    expect(body.high_bitrate).toBe(true);
    expect(body.duration).toBe(12);
  });
  it('tiers sem suporte não recebem os campos: VIP tem high_bitrate mas não som/resolução', async () => {
    await generateVideo(cfg, {
      engineId: 'seedance-2-vip-image-to-video', imageUrl: 'https://x/b.png', prompt: 'm',
      durationSeconds: 10, generateAudio: false, resolution: '480p', highBitrate: true,
    });
    const [url, init] = lastCall() as [string, RequestInit];
    expect(String(url)).toContain('/api/v1/seedance-2-vip-image-to-video');
    const body = JSON.parse(String(init.body));
    expect(body.resolution).toBeUndefined();
    expect(body.generate_audio).toBeUndefined();
    expect(body.high_bitrate).toBe(true);
    expect(body.duration).toBe(10);
  });
});

describe('isInsufficientCredit', () => {
  it('reconhece as variantes reais do erro de saldo e ignora outros erros', async () => {
    const { isInsufficientCredit } = await import('@/lib/muapi');
    expect(isInsufficientCredit(new Error('MuAPI 402: {"detail":"Insufficient credit balance"}'))).toBe(true);
    expect(isInsufficientCredit('INSUFFICIENT_CREDITS')).toBe(true);
    expect(isInsufficientCredit(new Error('MuAPI 500: boom'))).toBe(false);
    expect(isInsufficientCredit(new Error('timeout'))).toBe(false);
  });
});

describe('parseWebhook', () => {
  it('normaliza payload real de sucesso (id + outputs)', () => {
    const r = parseWebhook({
      id: 'task_9',
      status: 'completed',
      outputs: ['https://cdn/v.mp4'],
      urls: { get: 'https://api.muapi.ai/api/v1/predictions/task_9/result' },
      has_nsfw_contents: [false],
    });
    expect(r).toEqual({ requestId: 'task_9', status: 'completed', outputUrl: 'https://cdn/v.mp4', error: undefined });
  });
  it('aceita request_id legado', () => {
    expect(parseWebhook({ request_id: 'req_9', status: 'completed', outputs: ['u'] }).requestId).toBe('req_9');
  });
  it('normaliza falha e rejeita payload sem id', () => {
    expect(parseWebhook({ id: 'r', status: 'failed', error: 'nsfw' }).error).toBe('nsfw');
    expect(() => parseWebhook({ status: 'completed' })).toThrow();
  });
});

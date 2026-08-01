import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { muapiTextCaller } from '@/lib/muapi-text';

const submitOk = { request_id: 'req_txt_1' };

beforeEach(() => {
  process.env.MUAPI_API_KEY = 'k';
  process.env.MUAPI_BASE_URL = 'https://api.test';
  process.env.MUAPI_TEXT_MODEL = 'gpt-5-mini';
  process.env.MUAPI_TEXT_POLL_MS = '1';
});

afterEach(() => {
  delete process.env.MUAPI_TEXT_POLL_MS;
  vi.unstubAllGlobals();
});

describe('muapiTextCaller', () => {
  it('submete com system_prompt e devolve outputs[0] quando completed', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(submitOk), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: 'processing' }), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ status: 'completed', outputs: ['{"name":"Lara"}'] }), { status: 200 }),
      );
    vi.stubGlobal('fetch', fetchMock);

    const text = await muapiTextCaller('sistema', 'usuario');
    expect(text).toBe('{"name":"Lara"}');

    const [submitUrl, submitInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(submitUrl)).toBe('https://api.test/api/v1/gpt-5-mini');
    expect((submitInit.headers as Record<string, string>)['x-api-key']).toBe('k');
    const body = JSON.parse(String(submitInit.body));
    expect(body).toEqual({ prompt: 'usuario', system_prompt: 'sistema' });

    const [pollUrl] = fetchMock.mock.calls[1] as [string];
    expect(String(pollUrl)).toBe('https://api.test/api/v1/predictions/req_txt_1/result');
  });

  it('lança com a mensagem da MuAPI quando o job falha', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(new Response(JSON.stringify(submitOk), { status: 200 }))
        .mockResolvedValueOnce(new Response(JSON.stringify({ status: 'failed', error: 'nsfw' }), { status: 200 })),
    );
    await expect(muapiTextCaller('s', 'u')).rejects.toThrow(/nsfw/);
  });

  it('lança em submit não-2xx e em completed sem output', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response('sem saldo', { status: 402 })));
    await expect(muapiTextCaller('s', 'u')).rejects.toThrow(/MuAPI texto 402/);

    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(new Response(JSON.stringify(submitOk), { status: 200 }))
        .mockResolvedValueOnce(new Response(JSON.stringify({ status: 'completed', outputs: [] }), { status: 200 })),
    );
    await expect(muapiTextCaller('s', 'u')).rejects.toThrow(/sem output/);
  });
});

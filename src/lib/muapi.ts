import { z } from 'zod';

// Slugs validados contra o catálogo vivo (GET https://api.muapi.ai/api/v1/models) em 2026-07-30.
const IMAGE_T2I_PATH = '/api/v1/gpt-image-2-text-to-image';
const IMAGE_I2I_PATH = '/api/v1/gpt-image-2-image-to-image';
const VIDEO_MODEL_PATH = '/api/v1/seedance-2-mini-image-to-video';

// Formato vertical padrão do TikTok em todas as gerações.
const ASPECT_RATIO = '9:16';

export interface MuApiConfig { apiKey: string; baseUrl: string; webhookUrl: string }

export function muApiConfigFromEnv(): MuApiConfig {
  const apiKey = process.env.MUAPI_API_KEY;
  if (!apiKey) throw new Error('MUAPI_API_KEY ausente');
  const baseUrl = process.env.MUAPI_BASE_URL ?? 'https://api.muapi.ai';
  const appBase = process.env.APP_BASE_URL ?? 'http://localhost:3000';
  const secret = process.env.MUAPI_WEBHOOK_SECRET;
  return {
    apiKey,
    baseUrl,
    webhookUrl: `${appBase}/api/webhooks/muapi${secret ? `?secret=${secret}` : ''}`,
  };
}

// A doc não fixa o nome do campo na resposta de submissão; aceitamos os dois vistos nos schemas.
const SubmitResponseSchema = z
  .object({ request_id: z.string().min(1).optional(), id: z.string().min(1).optional() })
  .refine((d) => d.request_id || d.id, { message: 'resposta MuAPI sem request_id/id' });

async function submit(cfg: MuApiConfig, path: string, payload: Record<string, unknown>) {
  // O webhook é registrado como query param `webhook` na URL, não no corpo (docs/webhooks).
  const url = `${cfg.baseUrl}${path}?webhook=${encodeURIComponent(cfg.webhookUrl)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': cfg.apiKey },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`MuAPI ${res.status}: ${await res.text()}`);
  const data = SubmitResponseSchema.parse(await res.json());
  return { requestId: (data.request_id ?? data.id) as string };
}

export function generateImage(cfg: MuApiConfig, input: { prompt: string; imageUrls?: string[] }) {
  if (input.imageUrls?.length) {
    return submit(cfg, IMAGE_I2I_PATH, {
      prompt: input.prompt,
      images_list: input.imageUrls,
      aspect_ratio: ASPECT_RATIO,
    });
  }
  return submit(cfg, IMAGE_T2I_PATH, {
    prompt: input.prompt,
    aspect_ratio: ASPECT_RATIO,
  });
}

export function generateVideo(cfg: MuApiConfig, input: { imageUrl: string; prompt: string; durationSeconds: number }) {
  return submit(cfg, VIDEO_MODEL_PATH, {
    prompt: input.prompt,
    images_list: [input.imageUrl],
    duration: input.durationSeconds,
    resolution: '720p',
    aspect_ratio: ASPECT_RATIO,
  });
}

// Payload real do webhook (docs/webhooks): { id, status, outputs?, error?, urls, ... }.
// `request_id` mantido como fallback; campos extras são ignorados.
export const WebhookPayloadSchema = z
  .object({
    id: z.string().min(1).optional(),
    request_id: z.string().min(1).optional(),
    status: z.enum(['completed', 'failed']),
    outputs: z.array(z.string()).optional(),
    error: z.string().optional(),
  })
  .refine((d) => d.id || d.request_id, { message: 'webhook MuAPI sem id/request_id' });

export function parseWebhook(body: unknown) {
  const p = WebhookPayloadSchema.parse(body);
  return { requestId: (p.id ?? p.request_id) as string, status: p.status, outputUrl: p.outputs?.[0], error: p.error };
}

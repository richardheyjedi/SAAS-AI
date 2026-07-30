import { z } from 'zod';

// ⚠️ CONFERIR contra https://muapi.ai/docs antes do primeiro uso real:
// slugs de modelo e formato de payload podem divergir.
const IMAGE_MODEL_PATH = '/api/v1/gpt-image-2-text-to-image';
const VIDEO_MODEL_PATH = '/api/v1/seedance-2.0-mini-image-to-video';

export interface MuApiConfig { apiKey: string; baseUrl: string; webhookUrl: string }

export function muApiConfigFromEnv(): MuApiConfig {
  const apiKey = process.env.MUAPI_API_KEY;
  if (!apiKey) throw new Error('MUAPI_API_KEY ausente');
  const baseUrl = process.env.MUAPI_BASE_URL ?? 'https://api.muapi.ai';
  const appBase = process.env.APP_BASE_URL ?? 'http://localhost:3000';
  return { apiKey, baseUrl, webhookUrl: `${appBase}/api/webhooks/muapi` };
}

const SubmitResponseSchema = z.object({ request_id: z.string().min(1) });

async function submit(cfg: MuApiConfig, path: string, payload: Record<string, unknown>) {
  const res = await fetch(`${cfg.baseUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': cfg.apiKey },
    body: JSON.stringify({ ...payload, webhook_url: cfg.webhookUrl }),
  });
  if (!res.ok) throw new Error(`MuAPI ${res.status}: ${await res.text()}`);
  const data = SubmitResponseSchema.parse(await res.json());
  return { requestId: data.request_id };
}

export function generateImage(cfg: MuApiConfig, input: { prompt: string; imageUrls?: string[] }) {
  return submit(cfg, IMAGE_MODEL_PATH, {
    prompt: input.prompt,
    ...(input.imageUrls?.length ? { image_urls: input.imageUrls } : {}),
  });
}

export function generateVideo(cfg: MuApiConfig, input: { imageUrl: string; prompt: string; durationSeconds: number }) {
  return submit(cfg, VIDEO_MODEL_PATH, {
    image_url: input.imageUrl,
    prompt: input.prompt,
    duration: input.durationSeconds,
    resolution: '720p',
  });
}

export const WebhookPayloadSchema = z.object({
  request_id: z.string().min(1),
  status: z.enum(['completed', 'failed']),
  outputs: z.array(z.string()).optional(),
  error: z.string().optional(),
});

export function parseWebhook(body: unknown) {
  const p = WebhookPayloadSchema.parse(body);
  return { requestId: p.request_id, status: p.status, outputUrl: p.outputs?.[0], error: p.error };
}

import { z } from 'zod';
import { imageEngine, videoEngine, videoEnginePath } from './engines';

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

export function generateImage(
  cfg: MuApiConfig,
  input: { engineId: string; prompt: string; imageUrls?: string[]; aspectRatio?: string },
) {
  const engine = imageEngine(input.engineId);
  const aspect = input.aspectRatio ?? ASPECT_RATIO;
  if (input.imageUrls?.length) {
    return submit(cfg, engine.i2iPath, {
      prompt: input.prompt,
      images_list: input.imageUrls,
      aspect_ratio: aspect,
    });
  }
  return submit(cfg, engine.t2iPath, { prompt: input.prompt, aspect_ratio: aspect });
}

export function generateVideo(
  cfg: MuApiConfig,
  input: {
    engineId: string;
    imageUrl: string;
    prompt: string;
    durationSeconds: number;
    aspectRatio?: string;
    resolution?: string;
    generateAudio?: boolean;
    highBitrate?: boolean;
  },
) {
  const engine = videoEngine(input.engineId);
  const payload: Record<string, unknown> = {
    prompt: input.prompt,
    images_list: [input.imageUrl],
    duration: input.durationSeconds,
    aspect_ratio: input.aspectRatio ?? ASPECT_RATIO,
  };
  // Campos que o tier não expõe não são enviados (capacidades no registro de engines).
  if (engine.supportsResolution) payload.resolution = input.resolution ?? '720p';
  if (engine.supportsAudio) payload.generate_audio = input.generateAudio ?? true;
  if (engine.supportsHighBitrate && input.highBitrate) payload.high_bitrate = true;
  return submit(cfg, videoEnginePath(engine), payload);
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

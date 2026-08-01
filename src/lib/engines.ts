// Fonte única de verdade dos motores de geração.
// Slugs e preços validados contra GET https://api.muapi.ai/api/v1/models em 2026-07-31.

export interface ImageEngine {
  id: string;
  label: string;
  t2iPath: string;
  i2iPath: string;
  usdPerImage: number;
}

export interface VideoEngine {
  id: string; // slug do endpoint MuAPI: POST /api/v1/<id>
  label: string;
  usdBase5s: number; // preço de catálogo do clipe de 5s
  supportsResolution: boolean; // campo resolution (480p/720p) — só o Mini
  supportsAudio: boolean; // campo generate_audio — só o Mini
  supportsHighBitrate: boolean; // campo high_bitrate — Mini, VIP Fast e VIP
}

// Capacidades e limites validados campo a campo contra os input_schema
// de cada tier em 2026-08-01. Duração aceita em todos: 4 a 15 segundos.
export const VIDEO_DURATION_MIN = 4;
export const VIDEO_DURATION_MAX = 15;
// Aspect ratios aceitos por TODOS os 9 tiers (interseção dos enums da API).
export const VIDEO_ASPECT_RATIOS = ['9:16', '16:9', '4:3', '3:4'] as const;

export const IMAGE_ENGINES: ImageEngine[] = [
  { id: 'gpt-image-2', label: 'GPT Image 2', t2iPath: '/api/v1/gpt-image-2-text-to-image', i2iPath: '/api/v1/gpt-image-2-image-to-image', usdPerImage: 0.09 },
  { id: 'nano-banana-2', label: 'Nano Banana 2', t2iPath: '/api/v1/nano-banana-2', i2iPath: '/api/v1/nano-banana-2-edit', usdPerImage: 0.06 },
];

export const VIDEO_ENGINES: VideoEngine[] = [
  { id: 'seedance-2-mini-image-to-video', label: 'Seedance 2.0 Mini', usdBase5s: 0.2, supportsResolution: true, supportsAudio: true, supportsHighBitrate: true },
  { id: 'seedance-2-i2v-480p', label: 'Seedance 2.0 Standard 480p', usdBase5s: 0.6, supportsResolution: false, supportsAudio: false, supportsHighBitrate: false },
  { id: 'seedance-2-i2v', label: 'Seedance 2.0 Standard', usdBase5s: 0.75, supportsResolution: false, supportsAudio: false, supportsHighBitrate: false },
  { id: 'seedance-2-image-to-video-fast', label: 'Seedance 2.0 Fast', usdBase5s: 0.75, supportsResolution: false, supportsAudio: false, supportsHighBitrate: false },
  { id: 'seedance-2-image-to-video', label: 'Seedance 2.0 Full', usdBase5s: 1.25, supportsResolution: false, supportsAudio: false, supportsHighBitrate: false },
  { id: 'seedance-2-vip-image-to-video-fast', label: 'Seedance 2.0 VIP Fast', usdBase5s: 1.05, supportsResolution: false, supportsAudio: false, supportsHighBitrate: true },
  { id: 'seedance-2-vip-image-to-video', label: 'Seedance 2.0 VIP', usdBase5s: 1.5, supportsResolution: false, supportsAudio: false, supportsHighBitrate: true },
  { id: 'seedance-2-vip-image-to-video-1080p', label: 'Seedance 2.0 VIP 1080p', usdBase5s: 3.375, supportsResolution: false, supportsAudio: false, supportsHighBitrate: false },
  { id: 'seedance-2-vip-image-to-video-4k', label: 'Seedance 2.0 VIP 4K', usdBase5s: 6.75, supportsResolution: false, supportsAudio: false, supportsHighBitrate: false },
];

export const DEFAULT_IMAGE_ENGINE = 'gpt-image-2';
export const DEFAULT_VIDEO_ENGINE = 'seedance-2-mini-image-to-video';

export const IMAGE_ENGINE_IDS = IMAGE_ENGINES.map((e) => e.id) as [string, ...string[]];
export const VIDEO_ENGINE_IDS = VIDEO_ENGINES.map((e) => e.id) as [string, ...string[]];

export function imageEngine(id: string): ImageEngine {
  const engine = IMAGE_ENGINES.find((e) => e.id === id);
  if (!engine) throw new Error(`Motor de imagem desconhecido: ${id}`);
  return engine;
}

export function videoEngine(id: string): VideoEngine {
  const engine = VIDEO_ENGINES.find((e) => e.id === id);
  if (!engine) throw new Error(`Motor de vídeo desconhecido: ${id}`);
  return engine;
}

export function videoEnginePath(engine: VideoEngine): string {
  return `/api/v1/${engine.id}`;
}

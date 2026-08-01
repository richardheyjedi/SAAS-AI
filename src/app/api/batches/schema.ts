import { z } from 'zod';
import {
  DEFAULT_IMAGE_ENGINE, DEFAULT_VIDEO_ENGINE, IMAGE_ENGINE_IDS, VIDEO_ENGINE_IDS,
  VIDEO_ASPECT_RATIOS, VIDEO_DURATION_MAX, VIDEO_DURATION_MIN,
} from '@/lib/engines';

export const BatchBodySchema = z.object({
  modelId: z.string().uuid(),
  productId: z.string().uuid(),
  videoCount: z.number().int().min(1).max(40),
  durationSeconds: z.number().int().min(VIDEO_DURATION_MIN).max(VIDEO_DURATION_MAX),
  imageEngine: z.enum(IMAGE_ENGINE_IDS).default(DEFAULT_IMAGE_ENGINE),
  videoEngine: z.enum(VIDEO_ENGINE_IDS).default(DEFAULT_VIDEO_ENGINE),
  generateAudio: z.boolean().default(true),
  highBitrate: z.boolean().default(false),
  aspectRatio: z.enum(VIDEO_ASPECT_RATIOS).default('9:16'),
  resolution: z.enum(['480p', '720p']).default('720p'),
});

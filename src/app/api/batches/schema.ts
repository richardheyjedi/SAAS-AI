import { z } from 'zod';
import { DEFAULT_IMAGE_ENGINE, DEFAULT_VIDEO_ENGINE, IMAGE_ENGINE_IDS, VIDEO_ENGINE_IDS } from '@/lib/engines';

export const BatchBodySchema = z.object({
  modelId: z.string().uuid(),
  productId: z.string().uuid(),
  videoCount: z.number().int().min(1).max(40),
  durationSeconds: z.union([z.literal(5), z.literal(10)]),
  imageEngine: z.enum(IMAGE_ENGINE_IDS).default(DEFAULT_IMAGE_ENGINE),
  videoEngine: z.enum(VIDEO_ENGINE_IDS).default(DEFAULT_VIDEO_ENGINE),
});

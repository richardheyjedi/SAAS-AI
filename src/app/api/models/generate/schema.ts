import { z } from 'zod';
import { RegionSchema } from '@/types';
import { DEFAULT_IMAGE_ENGINE, IMAGE_ENGINE_IDS } from '@/lib/engines';

export const ModelGenerateBodySchema = z.object({
  region: RegionSchema,
  customPrompt: z.string().max(2000).optional(),
  refCount: z.number().int().min(1).max(5).default(3),
  imageEngine: z.enum(IMAGE_ENGINE_IDS).default(DEFAULT_IMAGE_ENGINE),
});

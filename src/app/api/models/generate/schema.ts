import { z } from 'zod';
import { RegionSchema } from '@/types';
import { DEFAULT_IMAGE_ENGINE, IMAGE_ENGINE_IDS } from '@/lib/engines';

export const ModelGenerateBodySchema = z
  .object({
    region: RegionSchema,
    customPrompt: z.string().max(2000).optional(),
    refCount: z.number().int().min(0).max(5).default(3),
    imageEngine: z.enum(IMAGE_ENGINE_IDS).default(DEFAULT_IMAGE_ENGINE),
    referenceUrls: z.array(z.string().url()).max(10).default([]),
    productId: z.string().uuid().optional(),
  })
  .refine((d) => d.refCount > 0 || d.referenceUrls.length > 0, {
    message: 'O modelo precisa de pelo menos uma referência (anexada ou gerada por IA)',
  });

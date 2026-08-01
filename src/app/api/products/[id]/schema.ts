import { z } from 'zod';

export const ProductUpdateSchema = z.object({
  title: z.string().min(2),
  description: z.string().default(''),
  priceBrl: z.number().positive().nullable(),
  imageUrls: z.array(z.string().url()).default([]),
});

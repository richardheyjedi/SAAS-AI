import { z } from 'zod';

// Só http(s): z.url() sozinho aceita javascript:/data:, e essas URLs são
// repassadas à MuAPI na composição.
export const ProductUpdateSchema = z.object({
  title: z.string().min(2),
  description: z.string().default(''),
  priceBrl: z.number().positive().nullable(),
  imageUrls: z.array(z.string().url().regex(/^https?:\/\//i)).default([]),
});

import { z } from 'zod';

export const DuplicateBodySchema = z.object({
  productId: z.string().uuid(),
  name: z.string().trim().max(120).optional().transform((v) => (v ? v : undefined)),
});

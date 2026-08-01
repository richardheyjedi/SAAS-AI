import { z } from 'zod';

export const NewRefsBodySchema = z.object({
  adjustPrompt: z.string().max(1000).optional(),
  count: z.number().int().min(1).max(5).default(3),
});

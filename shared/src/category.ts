import { z } from 'zod';

export const categorySchema = z.object({
  id: z.number().int(),
  name: z.string(),
  slaHours: z.number().int(),
});

export type Category = z.infer<typeof categorySchema>;

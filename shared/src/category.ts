import { z } from 'zod';

export const categorySchema = z.object({
  id: z.number().int(),
  name: z.string(),
  // Prazo de atendimento, em horas, das solicitações da categoria.
  slaHours: z.number().int(),
});

export type Category = z.infer<typeof categorySchema>;

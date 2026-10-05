import { z } from 'zod';

// Escopo de quem consulta: colaborador vê as próprias; atendente, todas.
export const dashboardSummarySchema = z.object({
  total: z.number().int(),
  open: z.number().int(),
  inProgress: z.number().int(),
  done: z.number().int(),
  overdue: z.number().int(),
  completedLate: z.number().int(),
  byCategory: z.array(z.object({ name: z.string(), total: z.number().int() })),
  averageTimeToStartHours: z.number().nullable(),
  averageResolutionHours: z.number().nullable(),
});

export type DashboardSummary = z.infer<typeof dashboardSummarySchema>;

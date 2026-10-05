import { z } from 'zod';

// Números do painel, sempre no escopo de quem consulta:
// o colaborador vê os das próprias solicitações; o atendente, os de todas.
export const dashboardSummarySchema = z.object({
  total: z.number().int(),
  open: z.number().int(),
  inProgress: z.number().int(),
  done: z.number().int(),
  // Ainda não concluídas e com o prazo (dueAt) vencido.
  overdue: z.number().int(),
  // Concluídas depois do prazo.
  completedLate: z.number().int(),
  // Média de horas entre a abertura e o início do atendimento; nulo enquanto nada foi iniciado.
  averageTimeToStartHours: z.number().nullable(),
  // Média de horas entre a abertura e a conclusão; nulo enquanto nada foi concluído.
  averageResolutionHours: z.number().nullable(),
});

export type DashboardSummary = z.infer<typeof dashboardSummarySchema>;

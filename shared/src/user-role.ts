import { z } from 'zod';

export const USER_ROLES = ['REQUESTER', 'AGENT'] as const;

export const userRoleSchema = z.enum(USER_ROLES);

export type UserRole = z.infer<typeof userRoleSchema>;

export const USER_ROLE_LABELS: Record<UserRole, string> = {
  REQUESTER: 'Colaborador',
  AGENT: 'Atendente',
};

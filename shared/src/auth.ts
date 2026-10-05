import { z } from 'zod';
import { userRoleSchema } from './user-role.js';

export const loginSchema = z.object({
  username: z.string().trim().toLowerCase().min(1, 'Informe o usuário').max(40),
  password: z.string().min(1, 'Informe a senha').max(128),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const authUserSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  username: z.string(),
  role: userRoleSchema,
});

export type AuthUser = z.infer<typeof authUserSchema>;

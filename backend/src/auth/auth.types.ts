import type { AuthUser } from '@portal/shared';
import type { Request } from 'express';

// Requisição depois do AuthGuard: usuário da sessão e o token que veio no cookie.
export interface AuthenticatedRequest extends Request {
  user: AuthUser;
  sessionToken: string;
}

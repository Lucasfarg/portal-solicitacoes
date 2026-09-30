import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { AuthUser } from '@portal/shared';
import type { AuthenticatedRequest } from './auth.types.js';

// Usuário da sessão, preenchido pelo AuthGuard.
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthUser =>
    context.switchToHttp().getRequest<AuthenticatedRequest>().user,
);

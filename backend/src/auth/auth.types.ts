import type { AuthUser } from '@portal/shared';
import type { Request } from 'express';

export interface AuthenticatedRequest extends Request {
  user: AuthUser;
  sessionToken: string;
}

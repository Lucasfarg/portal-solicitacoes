import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { CSRF_HEADER, CSRF_HEADER_VALUE } from '@portal/shared';
import type { Request } from 'express';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// Defesa CSRF por cabeçalho customizado (OWASP CSRF Prevention Cheat Sheet): o navegador
// não deixa outro site enviar X-Requested-With sem passar por CORS, que a API não libera.
// SameSite=Strict no cookie continua valendo como segunda camada.
@Injectable()
export class CsrfGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (SAFE_METHODS.has(request.method)) {
      return true;
    }
    if (request.get(CSRF_HEADER) !== CSRF_HEADER_VALUE) {
      throw new ForbiddenException(`Cabeçalho ${CSRF_HEADER} ausente ou inválido`);
    }
    return true;
  }
}

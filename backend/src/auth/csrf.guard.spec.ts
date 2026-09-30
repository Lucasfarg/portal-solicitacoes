import { type ExecutionContext, ForbiddenException } from '@nestjs/common';
import { CsrfGuard } from './csrf.guard.js';

function contextFor(method: string, headers: Record<string, string> = {}): ExecutionContext {
  const request = { method, get: (name: string) => headers[name.toLowerCase()] };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('CsrfGuard', () => {
  const guard = new CsrfGuard();

  it.each(['GET', 'HEAD', 'OPTIONS'])('libera %s sem o cabeçalho', (method) => {
    expect(guard.canActivate(contextFor(method))).toBe(true);
  });

  it.each(['POST', 'PATCH', 'PUT', 'DELETE'])('barra %s sem o cabeçalho', (method) => {
    expect(() => guard.canActivate(contextFor(method))).toThrow(ForbiddenException);
  });

  it('barra quando o cabeçalho vem com outro valor', () => {
    const context = contextFor('POST', { 'x-requested-with': 'fetch' });

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('libera quando o cabeçalho vem com o valor esperado', () => {
    const context = contextFor('POST', { 'x-requested-with': 'XMLHttpRequest' });

    expect(guard.canActivate(context)).toBe(true);
  });
});

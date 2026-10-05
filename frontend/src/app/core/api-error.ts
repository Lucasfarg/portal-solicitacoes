import { HttpErrorResponse } from '@angular/common/http';
import { ProblemDetails } from '@portal/shared';

// Os erros da API vêm no formato RFC 9457 (shared/http.ts); sem esse corpo, aviso genérico.
export const NO_SERVER_MESSAGE = 'Não foi possível falar com o servidor. Tente de novo.';

export function errorMessage(error: unknown): string {
  const problem =
    error instanceof HttpErrorResponse ? (error.error as Partial<ProblemDetails> | null) : null;
  if (!problem?.detail) {
    return NO_SERVER_MESSAGE;
  }
  const fields = (problem.errors ?? []).map((issue) => issue.message).join('; ');
  return fields ? `${problem.detail}: ${fields}` : problem.detail;
}

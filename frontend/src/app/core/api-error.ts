import { HttpErrorResponse } from '@angular/common/http';
import { ProblemDetails } from '@portal/shared';

// Texto para mostrar ao usuário a partir de um erro da API, que sempre vem no formato
// RFC 9457 (shared/http.ts): o `detail` e, nos erros de validação, o motivo de cada campo.
// Sem esse corpo (rede fora do ar, erro do proxy), um aviso genérico.
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

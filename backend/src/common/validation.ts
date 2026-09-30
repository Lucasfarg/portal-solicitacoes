import { BadRequestException, StandardSchemaValidationPipe } from '@nestjs/common';

export interface ValidationIssue {
  path: string;
  message: string;
}

// 400 que carrega os campos inválidos; o filtro de erros os devolve em `errors`.
export class ValidationException extends BadRequestException {
  constructor(readonly issues: ValidationIssue[]) {
    super('Dados inválidos');
  }
}

type PathSegment = PropertyKey | { readonly key: PropertyKey };

function formatPath(path: ReadonlyArray<PathSegment> | undefined): string {
  return (path ?? [])
    .map((segment) => String(typeof segment === 'object' ? segment.key : segment))
    .join('.');
}

// Valida parâmetros que declaram `schema` (ex.: @Body({ schema: loginSchema })),
// com os mesmos schemas Zod de shared/ usados pelo front.
export function createValidationPipe() {
  return new StandardSchemaValidationPipe({
    exceptionFactory: (issues) =>
      new ValidationException(
        issues.map((issue) => ({ path: formatPath(issue.path), message: issue.message })),
      ),
  });
}

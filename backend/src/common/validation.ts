import { BadRequestException, StandardSchemaValidationPipe } from '@nestjs/common';

export interface ValidationIssue {
  path: string;
  message: string;
}

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

export function createValidationPipe() {
  return new StandardSchemaValidationPipe({
    exceptionFactory: (issues) =>
      new ValidationException(
        issues.map((issue) => ({ path: formatPath(issue.path), message: issue.message })),
      ),
  });
}

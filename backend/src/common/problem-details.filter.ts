import { STATUS_CODES } from 'node:http';
import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { ProblemDetails } from '@portal/shared';
import type { Request, Response } from 'express';
import { ValidationException } from './validation.js';

function detailOf(exception: HttpException): string {
  const body = exception.getResponse();
  if (typeof body === 'string') {
    return body;
  }
  const message = (body as { message?: string | string[] }).message;
  return Array.isArray(message) ? message.join('; ') : (message ?? exception.message);
}

// Todo erro da API sai no formato da RFC 9457 (application/problem+json).
@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemDetailsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();

    const isHttp = exception instanceof HttpException;
    const status = isHttp ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    // Erro não previsto: o detalhe fica no log, não na resposta.
    if (!isHttp) {
      this.logger.error(exception instanceof Error ? exception.stack : exception);
    }

    const problem: ProblemDetails = {
      type: 'about:blank',
      title: STATUS_CODES[status] ?? 'Error',
      status,
      detail: isHttp ? detailOf(exception) : 'Erro interno inesperado',
      instance: request.originalUrl,
    };
    if (exception instanceof ValidationException) {
      problem.errors = exception.issues;
    }

    response.status(status).type('application/problem+json').json(problem);
  }
}

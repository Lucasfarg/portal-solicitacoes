import { STATUS_CODES } from 'node:http';
import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { ProblemDetails } from '@portal/shared';
import type { Request, Response } from 'express';
import { Prisma } from '../generated/prisma/client.js';
import { ValidationException } from './validation.js';

function detailOf(exception: HttpException): string {
  const body = exception.getResponse();
  if (typeof body === 'string') {
    return body;
  }
  const message = (body as { message?: string | string[] }).message;
  return Array.isArray(message) ? message.join('; ') : (message ?? exception.message);
}

// Traduz erros de fora do nosso código (Prisma, rota inexistente, corpo grande) para português.
function knownError(
  exception: unknown,
  request: Request,
): { status: number; detail: string } | null {
  if (exception instanceof Prisma.PrismaClientKnownRequestError) {
    if (exception.code === 'P2025') {
      return { status: HttpStatus.NOT_FOUND, detail: 'Registro não encontrado' };
    }
    if (exception.code === 'P2002') {
      return { status: HttpStatus.CONFLICT, detail: 'Já existe um registro com esse valor' };
    }
    return null;
  }
  // Mensagem exata do Nest para rota inexistente; nenhuma rota nossa lança 404 com esse texto.
  if (
    exception instanceof NotFoundException &&
    detailOf(exception) === `Cannot ${request.method} ${request.originalUrl}`
  ) {
    return { status: HttpStatus.NOT_FOUND, detail: 'Rota não encontrada' };
  }
  const parser = exception as { type?: string } | null;
  if (parser?.type === 'entity.too.large') {
    return {
      status: HttpStatus.PAYLOAD_TOO_LARGE,
      detail: 'O corpo da requisição é grande demais',
    };
  }
  return null;
}

@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemDetailsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();

    const known = knownError(exception, request);
    const isHttp = exception instanceof HttpException;
    const status =
      known?.status ?? (isHttp ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR);

    if (!known && !isHttp) {
      this.logger.error(exception instanceof Error ? exception.stack : exception);
    }

    const problem: ProblemDetails = {
      type: 'about:blank',
      title: STATUS_CODES[status] ?? 'Error',
      status,
      detail: known?.detail ?? (isHttp ? detailOf(exception) : 'Erro interno inesperado'),
      instance: request.originalUrl,
    };
    if (exception instanceof ValidationException) {
      problem.errors = exception.issues;
    }

    response.status(status).type('application/problem+json').json(problem);
  }
}

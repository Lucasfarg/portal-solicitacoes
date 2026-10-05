import { Logger } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

// Log de acesso: método, caminho, status e duração de cada requisição, sem corpo nem
// cookies. É o rastro para investigar um erro relatado ("às 14h a lista não abriu").
export function accessLog() {
  const logger = new Logger('HTTP');
  return (request: Request, response: Response, next: NextFunction) => {
    // O healthcheck do Docker chama a cada poucos segundos: só encheria o log.
    if (request.originalUrl === '/api/health') {
      next();
      return;
    }
    const started = performance.now();
    response.on('finish', () => {
      const ms = Math.round(performance.now() - started);
      logger.log(`${request.method} ${request.originalUrl} ${response.statusCode} ${ms}ms`);
    });
    next();
  };
}

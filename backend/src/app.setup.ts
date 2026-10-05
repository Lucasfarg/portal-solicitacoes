import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import type { Request, Response } from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import { ProblemDetailsFilter } from './common/problem-details.filter.js';
import { createValidationPipe } from './common/validation.js';
import type { Env } from './config/env.js';
import { setupSwagger } from './swagger.js';

export function configureApp(app: NestExpressApplication) {
  const config = app.get<ConfigService<Env, true>>(ConfigService);
  const httpsOnly = config.get('HTTPS_ONLY', { infer: true });

  // X-Forwarded-For só vale vindo de TRUST_PROXY: senão daria para forjar IP e escapar do limite de login.
  app.set('trust proxy', config.get('TRUST_PROXY', { infer: true }));
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          // Sem HTTPS, esta diretiva faria o navegador buscar o Swagger em https:// e a página ficaria em branco.
          'upgrade-insecure-requests': httpsOnly ? [] : null,
        },
      },
    }),
  );
  app.use(cookieParser());
  // Fora dos testes (só ruído).
  if (config.get('NODE_ENV', { infer: true }) !== 'test') {
    app.use(
      morgan<Request, Response>('tiny', {
        skip: (request) => request.originalUrl === '/api/health',
      }),
    );
  }
  app.setGlobalPrefix('api');
  app.useGlobalPipes(createValidationPipe());
  app.useGlobalFilters(new ProblemDetailsFilter());
  app.enableShutdownHooks();
  if (config.get('SWAGGER_ENABLED', { infer: true })) {
    setupSwagger(app);
  }
}

import { join } from 'node:path';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import type { NextFunction, Request, Response } from 'express';
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
  // Hospedagem numa imagem só: a API entrega os arquivos do frontend, e toda rota fora de
  // /api cai no index.html (as rotas são do Angular). Fica antes do Helmet, cuja política de
  // conteúdo é pensada para a API e bloquearia o carregamento dos estilos da tela.
  const webRoot = config.get('WEB_ROOT', { infer: true });
  if (webRoot) {
    app.disable('x-powered-by');
    app.useStaticAssets(webRoot);
    app.use((request: Request, response: Response, next: NextFunction) => {
      if (request.method === 'GET' && !request.path.startsWith('/api')) {
        response.sendFile(join(webRoot, 'index.html'));
      } else {
        next();
      }
    });
  }
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

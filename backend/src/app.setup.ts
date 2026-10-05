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

// Configuração aplicada tanto na subida real quanto nos testes e2e.
export function configureApp(app: NestExpressApplication) {
  const config = app.get<ConfigService<Env, true>>(ConfigService);
  const httpsOnly = config.get('HTTPS_ONLY', { infer: true });

  // Atrás de um proxy, o IP do cliente vem em X-Forwarded-For, e só vale se a conexão veio de
  // um endereço em TRUST_PROXY: aceitar o cabeçalho de qualquer um deixaria forjar um IP por
  // tentativa e escapar do limite de login. Padrão "loopback" (o proxy do `ng serve`, na mesma
  // máquina); no compose, a rede interna, onde só o nginx alcança a API.
  app.set('trust proxy', config.get('TRUST_PROXY', { infer: true }));
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          // Sem HTTPS (ambiente local e o compose), esta diretiva faria o navegador
          // buscar os arquivos do Swagger em https:// e a página ficaria em branco.
          'upgrade-insecure-requests': httpsOnly ? [] : null,
        },
      },
    }),
  );
  app.use(cookieParser());
  // Log de acesso (morgan): método, caminho, status e duração de cada requisição, sem corpo
  // nem cookies. Fica de fora nos testes (só ruído) e o healthcheck do Docker, que chama a
  // cada poucos segundos.
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

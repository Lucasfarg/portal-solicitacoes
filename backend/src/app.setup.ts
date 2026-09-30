import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { ProblemDetailsFilter } from './common/problem-details.filter.js';
import { createValidationPipe } from './common/validation.js';
import type { Env } from './config/env.js';
import { setupSwagger } from './swagger.js';

// Configuração aplicada tanto na subida real quanto nos testes e2e.
export function configureApp(app: NestExpressApplication) {
  const httpsOnly = app.get<ConfigService<Env, true>>(ConfigService).get('HTTPS_ONLY', {
    infer: true,
  });

  // Atrás do nginx, o IP do cliente vem em X-Forwarded-For. Só proxies de rede privada
  // (o nginx do compose) são aceitos como fonte, para o rate limit não ser burlado.
  app.set('trust proxy', 'loopback, uniquelocal');
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
  app.setGlobalPrefix('api');
  app.useGlobalPipes(createValidationPipe());
  app.useGlobalFilters(new ProblemDetailsFilter());
  app.enableShutdownHooks();
  setupSwagger(app);
}

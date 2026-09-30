import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { SessionCookie } from './auth/session-cookie.js';

// Documentação interativa em /api/docs, gerada dos mesmos schemas Zod que validam a API.
export function setupSwagger(app: INestApplication) {
  const config = new DocumentBuilder()
    .setTitle('Portal de Solicitações Internas')
    .setDescription(
      'Faça login em POST /api/auth/login: o navegador guarda o cookie de sessão e as demais rotas passam a responder.',
    )
    .setVersion('1.0')
    .addCookieAuth(app.get(SessionCookie).name)
    .build();

  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, config), {
    swaggerOptions: {
      // Esta função roda no navegador: acrescenta o cabeçalho que a defesa CSRF da API exige.
      requestInterceptor: (request: { headers: Record<string, string> }) => {
        request.headers['X-Requested-With'] = 'XMLHttpRequest';
        return request;
      },
    },
  });
}

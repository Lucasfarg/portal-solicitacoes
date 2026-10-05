import { fileURLToPath } from 'node:url';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module.js';
import { CategoriesModule } from './categories/categories.module.js';
import { validateEnv } from './config/env.js';
import { DashboardModule } from './dashboard/dashboard.module.js';
import { HealthModule } from './health/health.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { RequestsModule } from './requests/requests.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // .env único na raiz do repo, achado a partir deste arquivo (vale para src/ e dist/,
      // de qualquer pasta de onde a API rode); no Docker as variáveis vêm do ambiente.
      envFilePath: fileURLToPath(new URL('../../.env', import.meta.url)),
      validate: validateEnv,
    }),
    PrismaModule,
    AuthModule,
    HealthModule,
    CategoriesModule,
    RequestsModule,
    DashboardModule,
  ],
})
export class AppModule {}

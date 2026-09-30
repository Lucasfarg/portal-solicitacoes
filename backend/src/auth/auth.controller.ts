import { Body, Controller, Get, HttpCode, Post, Req, Res, UseGuards } from '@nestjs/common';
import {
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import {
  type AuthUser,
  authUserSchema,
  type LoginInput,
  loginSchema,
  problemDetailsSchema,
} from '@portal/shared';
import type { Response } from 'express';
import { AuthService } from './auth.service.js';
import type { AuthenticatedRequest } from './auth.types.js';
import { CurrentUser } from './current-user.decorator.js';
import { Public } from './public.decorator.js';
import { SessionService } from './session.service.js';
import { SessionCookie } from './session-cookie.js';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
    private readonly cookie: SessionCookie,
  ) {}

  @Public()
  // Limite de tentativas por IP (configurado no AuthModule).
  @UseGuards(ThrottlerGuard)
  @Post('login')
  @HttpCode(200)
  @ApiOperation({ summary: 'Abre a sessão e devolve o cookie' })
  @ApiOkResponse({ standardSchema: authUserSchema })
  @ApiUnauthorizedResponse({
    description: 'Usuário ou senha inválidos',
    standardSchema: problemDetailsSchema,
  })
  @ApiForbiddenResponse({ description: 'Sem o cabeçalho X-Requested-With' })
  @ApiTooManyRequestsResponse({ description: 'Mais de 5 tentativas em um minuto' })
  async login(
    @Body({ schema: loginSchema }) body: LoginInput,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthUser> {
    const { token, user } = await this.auth.login(body);
    this.cookie.set(response, token, this.sessions.absoluteMs);
    return user;
  }

  @Post('logout')
  @HttpCode(204)
  @ApiOperation({ summary: 'Encerra a sessão no servidor e limpa o cookie' })
  @ApiNoContentResponse()
  async logout(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.sessions.revoke(request.sessionToken);
    this.cookie.clear(response);
  }

  @Get('me')
  @ApiOperation({ summary: 'Usuário da sessão atual' })
  @ApiOkResponse({ standardSchema: authUserSchema })
  @ApiUnauthorizedResponse({ description: 'Sessão inexistente ou expirada' })
  me(@CurrentUser() user: AuthUser): AuthUser {
    return user;
  }
}

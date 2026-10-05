import { Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import {
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import {
  type AuthUser,
  authUserSchema,
  type LoginInput,
  loginSchema,
  problemDetailsSchema,
  SESSION_IDLE_HEADER,
  SESSION_REMAINING_HEADER,
} from '@portal/shared';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service.js';
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
  @Post('login')
  @HttpCode(200)
  @ApiOperation({ summary: 'Abre a sessão e devolve o cookie' })
  @ApiOkResponse({ standardSchema: authUserSchema })
  @ApiUnauthorizedResponse({
    description: 'Usuário ou senha inválidos',
    standardSchema: problemDetailsSchema,
  })
  @ApiForbiddenResponse({ description: 'Sem o cabeçalho X-Requested-With' })
  @ApiTooManyRequestsResponse({
    description:
      '5 erros no mesmo usuário vindos do mesmo IP, ou 20 erros do mesmo IP somando os usuários, em um minuto',
  })
  async login(
    @Body({ schema: loginSchema }) body: LoginInput,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthUser> {
    const { token, user } = await this.auth.login(body, request.ip ?? 'desconhecido');
    // Revoga a sessão anterior do mesmo navegador.
    const previous = this.cookie.read(request);
    if (previous) {
      await this.sessions.revoke(previous);
    }
    this.cookie.set(response, token, this.sessions.absoluteMs);
    response.setHeader(SESSION_IDLE_HEADER, String(this.sessions.idleMs / 60_000));
    response.setHeader(SESSION_REMAINING_HEADER, String(this.sessions.idleMs / 1000));
    return user;
  }

  // Pública: com a sessão já vencida o Sair ainda responde 204 e limpa o cookie.
  @Public()
  @Post('logout')
  @HttpCode(204)
  @ApiOperation({ summary: 'Encerra a sessão no servidor (se houver) e limpa o cookie' })
  @ApiNoContentResponse()
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    const token = this.cookie.read(request);
    if (token) {
      await this.sessions.revoke(token);
    }
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

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Res,
  StreamableFile,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  type AuthUser,
  type ChangeStatusInput,
  type CreateRequestInput,
  changeStatusSchema,
  createRequestSchema,
  idSchema,
  type ListRequestsQuery,
  listRequestsQuerySchema,
  problemDetailsSchema,
  type RequestDetail,
  type RequestPage,
  requestDetailSchema,
  requestPageSchema,
  type UpdateRequestInput,
  updateRequestSchema,
} from '@portal/shared';
import type { Response } from 'express';
import { z } from 'zod';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { EXPORT_CONTENT_TYPE, EXPORT_FORMATS, type ExportFormat } from './request-export.js';
import { RequestsService } from './requests.service.js';

const exportFormatSchema = z.enum(EXPORT_FORMATS, 'Use csv ou docx');

@ApiTags('requests')
@Controller('requests')
export class RequestsController {
  constructor(private readonly requests: RequestsService) {}

  @Post()
  @ApiOperation({ summary: 'Abre uma solicitação (nasce em Aberto, com prazo pelo SLA)' })
  @ApiCreatedResponse({ standardSchema: requestDetailSchema })
  @ApiBadRequestResponse({
    description: 'Campos inválidos ou categoria inexistente/inativa',
    standardSchema: problemDetailsSchema,
  })
  create(
    @CurrentUser() user: AuthUser,
    @Body({ schema: createRequestSchema }) body: CreateRequestInput,
  ): Promise<RequestDetail> {
    return this.requests.create(user, body);
  }

  @Get()
  @ApiOperation({
    summary: 'Lista com filtros e paginação (colaborador: só as próprias; atendente: todas)',
  })
  @ApiOkResponse({ standardSchema: requestPageSchema })
  list(
    @CurrentUser() user: AuthUser,
    @Query({ schema: listRequestsQuerySchema }) query: ListRequestsQuery,
  ): Promise<RequestPage> {
    return this.requests.list(user, query);
  }

  @Get('export/:format')
  @ApiOperation({ summary: 'Exporta as solicitações filtradas em CSV ou Word (docx)' })
  @ApiOkResponse({ description: 'Arquivo para download' })
  async export(
    @CurrentUser() user: AuthUser,
    @Param('format', { schema: exportFormatSchema }) format: ExportFormat,
    @Query({ schema: listRequestsQuerySchema }) query: ListRequestsQuery,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const file = await this.requests.export(user, query, format);
    response.set({
      'Content-Type': EXPORT_CONTENT_TYPE[format],
      'Content-Disposition': `attachment; filename="solicitacoes.${format}"`,
    });
    return new StreamableFile(file);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalhe com o histórico de status' })
  @ApiOkResponse({ standardSchema: requestDetailSchema })
  @ApiNotFoundResponse({ description: 'Solicitação inexistente, excluída ou de outro colaborador' })
  findOne(
    @CurrentUser() user: AuthUser,
    @Param('id', { schema: idSchema }) id: number,
  ): Promise<RequestDetail> {
    return this.requests.findOne(user, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Edita título, descrição ou categoria (só o dono, só em Aberto)' })
  @ApiOkResponse({ standardSchema: requestDetailSchema })
  @ApiForbiddenResponse({ description: 'Atendente que não é o dono' })
  @ApiNotFoundResponse({ description: 'Solicitação inexistente, excluída ou de outro colaborador' })
  @ApiConflictResponse({ description: 'A solicitação não está mais em Aberto' })
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', { schema: idSchema }) id: number,
    @Body({ schema: updateRequestSchema }) body: UpdateRequestInput,
  ): Promise<RequestDetail> {
    return this.requests.update(user, id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Exclui a solicitação (só o dono, só em Aberto); a linha fica no banco com deleted_at',
  })
  @ApiNoContentResponse()
  @ApiForbiddenResponse({ description: 'Atendente que não é o dono' })
  @ApiNotFoundResponse({ description: 'Solicitação inexistente, excluída ou de outro colaborador' })
  @ApiConflictResponse({ description: 'A solicitação não está mais em Aberto' })
  remove(
    @CurrentUser() user: AuthUser,
    @Param('id', { schema: idSchema }) id: number,
  ): Promise<void> {
    return this.requests.remove(user, id);
  }

  @Patch(':id/status')
  @ApiOperation({
    summary:
      'Avança o status: Aberto → Em Atendimento → Concluído (só atendente; quem inicia vira o responsável e só ele conclui)',
  })
  @ApiOkResponse({ standardSchema: requestDetailSchema })
  @ApiForbiddenResponse({
    description: 'Quem pede não é atendente, abriu a solicitação ou não é o responsável',
  })
  @ApiNotFoundResponse({ description: 'Solicitação inexistente, excluída ou de outro colaborador' })
  @ApiConflictResponse({ description: 'Transição inválida (pular etapa ou voltar)' })
  changeStatus(
    @CurrentUser() user: AuthUser,
    @Param('id', { schema: idSchema }) id: number,
    @Body({ schema: changeStatusSchema }) body: ChangeStatusInput,
  ): Promise<RequestDetail> {
    return this.requests.changeStatus(user, id, body.status);
  }
}

import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  AuthUser,
  CreateRequestInput,
  ListRequestsQuery,
  RequestDetail,
  RequestPage,
  RequestStatus,
  UpdateRequestInput,
} from '@portal/shared';
import { ValidationException } from '../common/validation.js';
import type { Env } from '../config/env.js';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  type RequestDetailRow,
  toRequestDetail,
  toRequestSummary,
  WITH_HISTORY,
  WITH_NAMES,
} from './request.mapper.js';
import {
  assertCanChangeStatus,
  assertCanModify,
  assertCanView,
  dueDate,
  overdueWhere,
  periodToUtcRange,
  visibleTo,
} from './request-rules.js';

// Todo instante gravado ou comparado sai do relógio da API (new Date()), nunca do now() do
// banco: abertura, prazo, histórico e "fora do prazo" ficam na mesma régua.
// Excluir não apaga a linha: grava deleted_at, e toda leitura ignora as excluídas.
@Injectable()
export class RequestsService {
  // Fuso do expediente (prazo em horas úteis) e das datas do filtro.
  private readonly timeZone: string;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService<Env, true>,
  ) {
    this.timeZone = config.get('APP_TIMEZONE', { infer: true });
  }

  async create(user: AuthUser, input: CreateRequestInput): Promise<RequestDetail> {
    const category = await this.findActiveCategory(input.categoryId);
    const openedAt = new Date();

    // A solicitação e o registro de abertura no histórico são gravados juntos (uma transação).
    const created = await this.prisma.request.create({
      data: {
        ...input,
        requesterId: user.id,
        createdAt: openedAt,
        dueAt: dueDate(openedAt, category.slaHours, this.timeZone),
        history: {
          create: { fromStatus: null, toStatus: 'OPEN', changedById: user.id, changedAt: openedAt },
        },
      },
    });
    // Relida já com categoria, solicitante e histórico, no formato da resposta.
    return this.detail(created.id);
  }

  async list(user: AuthUser, query: ListRequestsQuery): Promise<RequestPage> {
    const now = new Date();
    // Filtro não informado fica `undefined`, e o Prisma o ignora.
    const where: Prisma.RequestWhereInput = {
      ...visibleTo(user),
      deletedAt: null,
      status: query.status,
      categoryId: query.categoryId,
      createdAt: periodToUtcRange(this.timeZone, query.from, query.to),
      title: query.q ? { contains: query.q, mode: 'insensitive' } : undefined,
      AND: query.overdue ? overdueWhere(now) : undefined,
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.request.findMany({
        where,
        include: WITH_NAMES,
        omit: { description: true },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.request.count({ where }),
    ]);
    return {
      items: rows.map((row) => toRequestSummary(row, now)),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  async findOne(user: AuthUser, id: number): Promise<RequestDetail> {
    const request = await this.findOrFail(id);
    assertCanView(user, request);
    return toRequestDetail(request, new Date());
  }

  async update(user: AuthUser, id: number, input: UpdateRequestInput): Promise<RequestDetail> {
    const current = await this.findOrFail(id);
    assertCanModify(user, current);

    // Trocar de categoria troca o SLA, mas o prazo nunca é adiado: vale o menor entre o atual
    // e o refeito com o SLA novo (contado da abertura). Se adiasse, bastaria trocar a
    // categoria para tirar uma solicitação do atraso.
    let dueAt = current.dueAt;
    if (input.categoryId !== undefined && input.categoryId !== current.categoryId) {
      const category = await this.findActiveCategory(input.categoryId);
      const recalculated = dueDate(current.createdAt, category.slaHours, this.timeZone);
      dueAt = recalculated < current.dueAt ? recalculated : current.dueAt;
    }

    // A regra (dono, em Aberto) entra no WHERE da própria gravação: se um atendente iniciou
    // o atendimento depois da leitura acima, nada é gravado.
    const { count } = await this.prisma.request.updateMany({
      where: { id, requesterId: user.id, status: 'OPEN', deletedAt: null },
      data: { ...input, dueAt },
    });
    if (count === 0) {
      await this.explainRefusal(user, id);
    }
    return this.detail(id);
  }

  async remove(user: AuthUser, id: number): Promise<void> {
    const current = await this.findOrFail(id);
    assertCanModify(user, current);
    // Exclusão lógica, com a mesma condição no WHERE: a linha e o histórico ficam no banco
    // (auditoria), marcados com o instante da exclusão.
    const { count } = await this.prisma.request.updateMany({
      where: { id, requesterId: user.id, status: 'OPEN', deletedAt: null },
      data: { deletedAt: new Date() },
    });
    if (count === 0) {
      await this.explainRefusal(user, id);
    }
  }

  async changeStatus(user: AuthUser, id: number, to: RequestStatus): Promise<RequestDetail> {
    const current = await this.findOrFail(id);
    assertCanChangeStatus(user, current, to);
    const starting = to === 'IN_PROGRESS';

    await this.prisma.$transaction(async (tx) => {
      // O status lido acima entra no WHERE: se outro atendente mudou primeiro, nenhuma linha
      // é alterada e a transação é desfeita, sem gravar histórico duplicado. Quem inicia o
      // atendimento vira o responsável; concluir exige ainda ser o responsável.
      const { count } = await tx.request.updateMany({
        where: starting
          ? { id, status: current.status, deletedAt: null }
          : { id, status: current.status, deletedAt: null, assigneeId: user.id },
        data: starting ? { status: to, assigneeId: user.id } : { status: to },
      });
      if (count === 0) {
        throw new ConflictException('O status desta solicitação acabou de ser alterado');
      }
      await tx.requestStatusHistory.create({
        data: {
          requestId: id,
          fromStatus: current.status,
          toStatus: to,
          changedById: user.id,
          changedAt: new Date(),
        },
      });
    });
    return this.detail(id);
  }

  // A gravação condicional não alterou nada: alguém mudou a solicitação entre a leitura e a
  // gravação. Relê para responder o motivo atual (404 se foi excluída, 409 se saiu de Aberto).
  // assertCanModify também confere se quem pede vê a solicitação (404 se não vê).
  private async explainRefusal(user: AuthUser, id: number): Promise<never> {
    const latest = await this.findOrFail(id);
    assertCanModify(user, latest);
    throw new ConflictException('A solicitação acabou de ser alterada; recarregue e tente de novo');
  }

  private async detail(id: number): Promise<RequestDetail> {
    return toRequestDetail(await this.findOrFail(id), new Date());
  }

  private async findOrFail(id: number): Promise<RequestDetailRow> {
    // Excluída responde como inexistente.
    const request = await this.prisma.request.findFirst({
      where: { id, deletedAt: null },
      include: WITH_HISTORY,
    });
    if (!request) {
      throw new NotFoundException('Solicitação não encontrada');
    }
    return request;
  }

  // Categoria inexistente ou desativada é erro de preenchimento: 400 apontando o campo.
  private async findActiveCategory(id: number) {
    const category = await this.prisma.category.findFirst({ where: { id, active: true } });
    if (!category) {
      throw new ValidationException([
        { path: 'categoryId', message: 'Categoria inexistente ou inativa' },
      ]);
    }
    return category;
  }
}

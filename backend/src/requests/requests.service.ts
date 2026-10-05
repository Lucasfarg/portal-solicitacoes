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

// Todo instante vem do relógio da API, nunca do now() do banco, para ficar na mesma régua.
@Injectable()
export class RequestsService {
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
    return this.detail(created.id);
  }

  async list(user: AuthUser, query: ListRequestsQuery): Promise<RequestPage> {
    const now = new Date();
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

    // O prazo nunca é adiado: senão bastaria trocar a categoria para tirar a solicitação do atraso.
    let dueAt = current.dueAt;
    if (input.categoryId !== undefined && input.categoryId !== current.categoryId) {
      const category = await this.findActiveCategory(input.categoryId);
      const recalculated = dueDate(current.createdAt, category.slaHours, this.timeZone);
      dueAt = recalculated < current.dueAt ? recalculated : current.dueAt;
    }

    // A regra entra no WHERE da gravação: se um atendente iniciou depois da leitura, nada é gravado.
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
      // O status lido entra no WHERE: se outro atendente mudou primeiro, a transação é desfeita sem histórico duplicado.
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

  // Nada alterado: relê para responder o motivo atual (404 se excluída, 409 se saiu de Aberto).
  private async explainRefusal(user: AuthUser, id: number): Promise<never> {
    const latest = await this.findOrFail(id);
    assertCanModify(user, latest);
    throw new ConflictException('A solicitação acabou de ser alterada; recarregue e tente de novo');
  }

  private async detail(id: number): Promise<RequestDetail> {
    return toRequestDetail(await this.findOrFail(id), new Date());
  }

  private async findOrFail(id: number): Promise<RequestDetailRow> {
    const request = await this.prisma.request.findFirst({
      where: { id, deletedAt: null },
      include: WITH_HISTORY,
    });
    if (!request) {
      throw new NotFoundException('Solicitação não encontrada');
    }
    return request;
  }

  // Categoria inexistente ou desativada é 400 apontando o campo.
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

import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
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
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  type RequestDetailRow,
  toRequestDetail,
  toRequestDto,
  WITH_HISTORY,
  WITH_NAMES,
} from './request.mapper.js';
import {
  assertCanChangeStatus,
  assertCanModify,
  assertCanView,
  dueDate,
  periodToUtcRange,
  visibleTo,
} from './request-rules.js';

@Injectable()
export class RequestsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(user: AuthUser, input: CreateRequestInput): Promise<RequestDetail> {
    const category = await this.findActiveCategory(input.categoryId);
    const openedAt = new Date();

    // A solicitação e o registro de abertura no histórico são gravados juntos (uma transação).
    const created = await this.prisma.request.create({
      data: {
        ...input,
        requesterId: user.id,
        createdAt: openedAt,
        dueAt: dueDate(openedAt, category.slaHours),
        history: {
          create: { fromStatus: null, toStatus: 'OPEN', changedById: user.id, changedAt: openedAt },
        },
      },
    });
    // Relida já com categoria, solicitante e histórico, no formato da resposta.
    return toRequestDetail(await this.findOrFail(created.id));
  }

  async list(user: AuthUser, query: ListRequestsQuery): Promise<RequestPage> {
    // Filtro não informado fica `undefined`, e o Prisma o ignora.
    const where: Prisma.RequestWhereInput = {
      ...visibleTo(user),
      status: query.status,
      categoryId: query.categoryId,
      createdAt: periodToUtcRange(query.from, query.to),
      title: query.q ? { contains: query.q, mode: 'insensitive' } : undefined,
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.request.findMany({
        where,
        include: WITH_NAMES,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.request.count({ where }),
    ]);
    return { items: rows.map(toRequestDto), page: query.page, pageSize: query.pageSize, total };
  }

  async findOne(user: AuthUser, id: number): Promise<RequestDetail> {
    const request = await this.findOrFail(id);
    assertCanView(user, request);
    return toRequestDetail(request);
  }

  async update(user: AuthUser, id: number, input: UpdateRequestInput): Promise<RequestDetail> {
    const current = await this.findOrFail(id);
    assertCanModify(user, current);

    // Trocar de categoria troca o SLA: o prazo é refeito, ainda contado a partir da abertura.
    let dueAt = current.dueAt;
    if (input.categoryId !== undefined && input.categoryId !== current.categoryId) {
      const category = await this.findActiveCategory(input.categoryId);
      dueAt = dueDate(current.createdAt, category.slaHours);
    }

    await this.prisma.request.update({ where: { id }, data: { ...input, dueAt } });
    return toRequestDetail(await this.findOrFail(id));
  }

  async remove(user: AuthUser, id: number): Promise<void> {
    const current = await this.findOrFail(id);
    assertCanModify(user, current);
    // Exclusão física; o histórico sai junto (ON DELETE CASCADE).
    await this.prisma.request.delete({ where: { id } });
  }

  async changeStatus(user: AuthUser, id: number, to: RequestStatus): Promise<RequestDetail> {
    const current = await this.findOrFail(id);
    assertCanChangeStatus(user, current.status, to);

    await this.prisma.$transaction(async (tx) => {
      // O status lido acima entra no WHERE: se outro atendente mudou primeiro, nenhuma linha
      // é alterada e a transação é desfeita, sem gravar histórico duplicado.
      const { count } = await tx.request.updateMany({
        where: { id, status: current.status },
        data: { status: to },
      });
      if (count === 0) {
        throw new ConflictException('O status desta solicitação acabou de ser alterado');
      }
      await tx.requestStatusHistory.create({
        data: { requestId: id, fromStatus: current.status, toStatus: to, changedById: user.id },
      });
    });
    return toRequestDetail(await this.findOrFail(id));
  }

  private async findOrFail(id: number): Promise<RequestDetailRow> {
    const request = await this.prisma.request.findUnique({ where: { id }, include: WITH_HISTORY });
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

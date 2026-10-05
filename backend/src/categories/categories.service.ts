import { Injectable } from '@nestjs/common';
import type { Category } from '@portal/shared';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  listActive(): Promise<Category[]> {
    return this.prisma.category.findMany({
      where: { active: true },
      select: { id: true, name: true, slaHours: true },
      orderBy: { name: 'asc' },
    });
  }
}

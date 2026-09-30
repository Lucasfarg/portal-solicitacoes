import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { type Category, categorySchema } from '@portal/shared';
import { z } from 'zod';
import { CategoriesService } from './categories.service.js';

@ApiTags('categories')
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Get()
  @ApiOperation({ summary: 'Categorias ativas, em ordem alfabética' })
  @ApiOkResponse({ standardSchema: z.array(categorySchema) })
  list(): Promise<Category[]> {
    return this.categories.listActive();
  }
}

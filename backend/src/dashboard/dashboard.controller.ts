import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { type AuthUser, type DashboardSummary, dashboardSummarySchema } from '@portal/shared';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { DashboardService } from './dashboard.service.js';

@ApiTags('dashboard')
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('summary')
  @ApiOperation({
    summary:
      'Totais por status, atrasos e tempos médios (até o início e até a conclusão), no escopo de quem consulta',
  })
  @ApiOkResponse({ standardSchema: dashboardSummarySchema })
  summary(@CurrentUser() user: AuthUser): Promise<DashboardSummary> {
    return this.dashboard.summary(user);
  }
}

import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';
import { TenantContext } from 'src/auth/decorators/tenant-context.decorator';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { Roles } from 'src/auth/decorators/roles.decorator';

@ApiTags('Admin Dashboard')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('admin')
  @Roles('admin', 'super_admin')
  @ApiOperation({
    summary:
      "Admin bosh sahifasi uchun umumiy statistika: guruhlar, talabalar, o'qituvchilar, fanlar, sovg'alar soni, coin iqtisodiyoti, e'tibor talab qiluvchi vazifalar, so'nggi faoliyat va reyting",
  })
  getAdminDashboard(@TenantContext() tenantId: string) {
    return this.dashboardService.getAdminDashboard(tenantId);
  }
}

import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { TenantContext } from '../auth/decorators/tenant-context.decorator';
import { TenantService } from './tenant.service';
import { UpdateTenantSettingsDto } from './dto/update-tenant-settings.dto';

// Tenantning o'z sozlamalari — tenant admini boshqaradi (TenantController esa faqat super_admin uchun)
@ApiTags('Tenant settings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('tenant-settings')
export class TenantSettingsController {
  constructor(private readonly tenantService: TenantService) {}

  @Get()
  @Roles('admin', 'super_admin', 'teacher')
  @ApiOperation({
    summary:
      "Tenant sozlamalari (teacher ham o'qiydi — coin berish formasida limitni ko'rsatish uchun)",
  })
  get(@TenantContext() tenantId: string) {
    return this.tenantService.getSettings(tenantId);
  }

  @Patch()
  @Roles('admin', 'super_admin')
  @ApiOperation({ summary: 'Tenant sozlamalarini yangilash' })
  update(
    @TenantContext() tenantId: string,
    @Body() dto: UpdateTenantSettingsDto,
  ) {
    return this.tenantService.updateSettings(tenantId, dto);
  }
}

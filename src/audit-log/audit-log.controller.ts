import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { AuditLogService, QueryAuditLogDto } from './audit-log.service';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { TenantContext } from 'src/auth/decorators/tenant-context.decorator';

@ApiTags('Audit Log')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('audit-logs')
export class AuditLogController {
  constructor(private readonly auditLogService: AuditLogService) {}

  @Get()
  @Roles('admin', 'super_admin')
  @ApiOperation({
    summary: "Audit log tarixi — kim, qachon, qanday amal bajarganini ko'rish",
  })
  findAll(@TenantContext() tenantId: string, @Query() query: QueryAuditLogDto) {
    return this.auditLogService.findAll(query, tenantId);
  }
}

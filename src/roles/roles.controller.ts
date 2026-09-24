import {
  Controller,
  Get,
  Param,
  Query,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { RolesService } from './roles.service';
import { QueryRoleDto } from './dto/query-role.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { TenantContext } from 'src/auth/decorators/tenant-context.decorator';

@ApiTags('Roles')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('roles')
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  // admin: /roles, super_admin: /roles?tenantId=some-tenant-uuid
  @Get()
  @Roles('admin', 'super_admin')
  @ApiOperation({ summary: 'Tenantga tegishli rollar (user yaratish uchun)' })
  findAll(@TenantContext() tenantId: string, @Query() query: QueryRoleDto) {
    return this.rolesService.findAll(tenantId, query);
  }

  // admin: /roles/:id, super_admin: /roles/:id?tenantId=some-tenant-uuid
  @Get(':id')
  @Roles('admin', 'super_admin')
  @ApiOperation({ summary: 'Bitta role' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @TenantContext() tenantId: string,
  ) {
    return this.rolesService.findOne(tenantId, id);
  }
}

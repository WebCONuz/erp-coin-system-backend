import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
  UseGuards,
  HttpCode,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { RolesService } from './roles.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
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
  @Post()
  @Roles('admin', 'super_admin')
  @ApiOperation({ summary: 'Yangi role yaratish' })
  create(@TenantContext() tenantId: string, @Body() dto: CreateRoleDto) {
    return this.rolesService.create(tenantId, dto);
  }

  // admin: /roles, super_admin: /roles?tenantId=some-tenant-uuid
  @Get()
  @Roles('admin', 'super_admin')
  @ApiOperation({ summary: 'Barcha rollar' })
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

  // admin: /roles/:id, super_admin: /roles/:id?tenantId=some-tenant-uuid
  @Patch(':id')
  @Roles('admin', 'super_admin')
  @ApiOperation({ summary: 'Roleni yangilash' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @TenantContext() tenantId: string,
    @Body() dto: UpdateRoleDto,
  ) {
    return this.rolesService.update(tenantId, id, dto);
  }

  // admin: /roles/:id, super_admin: /roles/:id?tenantId=some-tenant-uuid
  @Delete(':id')
  @HttpCode(204)
  @Roles('admin', 'super_admin')
  @ApiOperation({ summary: "Roleni o'chirish" })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @TenantContext() tenantId: string,
  ) {
    return this.rolesService.remove(tenantId, id);
  }
}

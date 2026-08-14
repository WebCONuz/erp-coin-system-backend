import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Delete,
  Query,
  UseGuards,
  ParseUUIDPipe,
  HttpCode,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { SessionsService } from './sessions.service';
import { CreateSessionDto } from './dto/create-session.dto';
import { UpdateSessionDto } from './dto/update-session.dto';
import { QuerySessionDto } from './dto/query-session.dto';
import { BulkAttendanceDto } from './dto/record-attendance.dto';
import { TenantContext } from 'src/auth/decorators/tenant-context.decorator';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { Roles } from 'src/auth/decorators/roles.decorator';

@ApiTags("O'quv jarayoni: Darslar va Yo'qlama")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('sessions')
export class SessionsController {
  constructor(private readonly sessionsService: SessionsService) {}

  @Post()
  @ApiOperation({ summary: 'Yangi dars (mashgulot) ochish/rejalashtirish' })
  create(@TenantContext() tenantId: string, @Body() dto: CreateSessionDto) {
    return this.sessionsService.create(tenantId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Darslar jadvalini korish (Filtrlar bilan)' })
  findAll(@TenantContext() tenantId: string, @Query() query: QuerySessionDto) {
    return this.sessionsService.findAll(query, tenantId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Dars tafsilotlarini korish' })
  @ApiParam({ name: 'id', format: 'uuid' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @TenantContext() tenantId: string,
  ) {
    return this.sessionsService.findOne(id, tenantId);
  }

  @Post(':id/attendance')
  @ApiOperation({
    summary:
      'Dars uchun oquvchilarni yoqlama qilish va tangalarni avtomatik hisoblash',
  })
  @ApiParam({ name: 'id', format: 'uuid', description: 'Dars (Session) IDsi' })
  recordAttendance(
    @Param('id', ParseUUIDPipe) sessionId: string,
    @TenantContext() tenantId: string,
    @CurrentUser('id') recordedById: string,
    @Body() dto: BulkAttendanceDto,
  ) {
    return this.sessionsService.saveAttendanceAndProcessCoins(
      sessionId,
      tenantId,
      recordedById,
      dto,
    );
  }

  @Get(':id/attendance')
  @ApiOperation({ summary: 'Dars boyicha yoqlama royxatini korish' })
  @ApiParam({ name: 'id', format: 'uuid' })
  getAttendance(
    @Param('id', ParseUUIDPipe) sessionId: string,
    @TenantContext() tenantId: string,
  ) {
    return this.sessionsService.getAttendanceBySession(sessionId, tenantId);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Dars malumotlarini yangilash (qulflanmagan bolsa)',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @TenantContext() tenantId: string,
    @Body() dto: UpdateSessionDto,
  ) {
    return this.sessionsService.update(id, tenantId, dto);
  }

  @Post(':id/lock')
  @Roles('admin', 'super_admin', 'teacher')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Darsni qulflash — yoqlama va tahrirlash bloklanadi',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  lock(
    @Param('id', ParseUUIDPipe) id: string,
    @TenantContext() tenantId: string,
    @CurrentUser('id') requesterId: string,
  ) {
    return this.sessionsService.lock(id, tenantId, requesterId);
  }

  @Post(':id/unlock')
  @Roles('admin', 'super_admin')
  @HttpCode(200)
  @ApiOperation({ summary: 'Dars qulfini ochish (faqat admin/super_admin)' })
  @ApiParam({ name: 'id', format: 'uuid' })
  unlock(
    @Param('id', ParseUUIDPipe) id: string,
    @TenantContext() tenantId: string,
  ) {
    return this.sessionsService.unlock(id, tenantId);
  }

  @Delete(':id')
  @Roles('admin', 'super_admin')
  @ApiOperation({ summary: 'Darsni ochirish (Soft-Delete)' })
  @ApiParam({ name: 'id', format: 'uuid' })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @TenantContext() tenantId: string,
  ) {
    return this.sessionsService.remove(id, tenantId);
  }
}

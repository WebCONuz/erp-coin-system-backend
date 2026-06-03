import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { SessionsService } from './sessions.service';
import { CreateSessionDto } from './dto/create-session.dto';
import { QuerySessionDto } from './dto/query-session.dto';
import { BulkAttendanceDto } from './dto/record-attendance.dto';
import { TenantContext } from 'src/auth/decorators/tenant-context.decorator';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';

@ApiTags('O‘quv jarayoni: Darslar va Yo‘qlama (Attendance)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('sessions')
export class SessionsController {
  constructor(private readonly sessionsService: SessionsService) {}

  @Post()
  @ApiOperation({ summary: 'Yangi dars (mashg‘ulot) ochish/rejalashtirish' })
  create(@TenantContext() tenantId: string, @Body() dto: CreateSessionDto) {
    return this.sessionsService.create(tenantId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Darslar jadvalini ko‘rish (Filtrlar bilan)' })
  findAll(@TenantContext() tenantId: string, @Query() query: QuerySessionDto) {
    return this.sessionsService.findAll(query, tenantId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Dars tafsilotlarini ko‘rish' })
  @ApiParam({ name: 'id', format: 'uuid' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @TenantContext() tenantId: string,
  ) {
    return this.sessionsService.findOne(id, tenantId);
  }

  // 📝 YO‘QLAMA QILISH (BULK ATTENDANCE) ENDPOINTI
  @Post(':id/attendance')
  @ApiOperation({
    summary:
      'Dars uchun guruh o‘quvchilarini yo‘qlama qilish hamda tangalarni avtomatik hisoblash',
  })
  @ApiParam({ name: 'id', format: 'uuid', description: 'Dars (Session) IDsi' })
  recordAttendance(
    @Param('id', ParseUUIDPipe) sessionId: string,
    @TenantContext() tenantId: string,
    @CurrentUser('id') recordedById: string, // Yo‘qlama qilgan o‘qituvchi/admin
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
  @ApiOperation({
    summary: 'Ushbu dars bo‘yicha qilingan yo‘qlama ro‘yxatini ko‘rish',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  getAttendance(
    @Param('id', ParseUUIDPipe) sessionId: string,
    @TenantContext() tenantId: string,
  ) {
    return this.sessionsService.getAttendanceBySession(sessionId, tenantId);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Darsni o‘chirish (Soft-Delete)' })
  @ApiParam({ name: 'id', format: 'uuid' })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @TenantContext() tenantId: string,
  ) {
    return this.sessionsService.remove(id, tenantId);
  }
}

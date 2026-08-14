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
  ParseIntPipe,
  UseGuards,
  HttpCode,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { ScheduleService } from './schedule.service';
import { CreateScheduleTemplateDto } from './dto/create-schedule-template.dto';
import { UpdateScheduleTemplateDto } from './dto/update-schedule-template.dto';
import { CreateScheduleExceptionDto } from './dto/create-schedule-exception.dto';
import { GenerateSessionsDto } from './dto/generate-sessions.dto';
import { QueryScheduleDto } from './dto/query-schedule.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { TenantContext } from 'src/auth/decorators/tenant-context.decorator';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';

@ApiTags('Dars Jadvali (Schedule)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('schedule-templates')
export class ScheduleController {
  constructor(private readonly scheduleService: ScheduleService) {}

  // ─── ScheduleTemplate CRUD ─────────────────────────────────────

  @Post()
  @Roles('admin', 'super_admin')
  @ApiOperation({ summary: "Yangi haftalik dars vaqtini jadvalga qo'shish" })
  createTemplate(
    @Body() dto: CreateScheduleTemplateDto,
    @TenantContext() tenantId: string,
    @CurrentUser('id') createdById: string,
  ) {
    return this.scheduleService.createTemplate(dto, tenantId, createdById);
  }

  @Get()
  @Roles('admin', 'super_admin', 'teacher')
  @ApiOperation({
    summary: "Dars jadvallari ro'yxati (filter: groupId, weekday, roomId)",
  })
  findAllTemplates(
    @TenantContext() tenantId: string,
    @Query() query: QueryScheduleDto,
  ) {
    return this.scheduleService.findAllTemplates(query, tenantId);
  }

  @Get('calendar')
  @Roles('admin', 'super_admin', 'teacher')
  @ApiOperation({
    summary: "Oylik kalandar ko'rinishi — bir guruhning oylik dars jadvali",
  })
  @ApiQuery({ name: 'groupId', required: true })
  @ApiQuery({ name: 'year', required: true, example: 2026 })
  @ApiQuery({ name: 'month', required: true, example: 9 })
  getCalendar(
    @TenantContext() tenantId: string,
    @Query('groupId', ParseUUIDPipe) groupId: string,
    @Query('year', ParseIntPipe) year: number,
    @Query('month', ParseIntPipe) month: number,
  ) {
    return this.scheduleService.getCalendar(groupId, year, month, tenantId);
  }

  @Post('generate-sessions')
  @Roles('admin', 'super_admin')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Jadval shablonlaridan muayyan oy/davr uchun Session yozuvlarini avtomatik yaratish',
  })
  generateSessions(
    @Body() dto: GenerateSessionsDto,
    @TenantContext() tenantId: string,
    @CurrentUser('id') createdById: string,
  ) {
    return this.scheduleService.generateSessions(dto, tenantId, createdById);
  }

  @Get(':id')
  @Roles('admin', 'super_admin', 'teacher')
  @ApiOperation({
    summary: 'Bitta dars jadvali (barcha istisno kunlari bilan)',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  findOneTemplate(
    @Param('id', ParseUUIDPipe) id: string,
    @TenantContext() tenantId: string,
  ) {
    return this.scheduleService.findOneTemplate(id, tenantId);
  }

  @Patch(':id')
  @Roles('admin', 'super_admin')
  @ApiOperation({ summary: 'Dars jadvalini yangilash (vaqt, xona)' })
  @ApiParam({ name: 'id', format: 'uuid' })
  updateTemplate(
    @Param('id', ParseUUIDPipe) id: string,
    @TenantContext() tenantId: string,
    @Body() dto: UpdateScheduleTemplateDto,
  ) {
    return this.scheduleService.updateTemplate(id, tenantId, dto);
  }

  @Delete(':id')
  @Roles('admin', 'super_admin')
  @HttpCode(200)
  @ApiOperation({ summary: "Dars jadvalini o'chirish (soft-delete)" })
  @ApiParam({ name: 'id', format: 'uuid' })
  removeTemplate(
    @Param('id', ParseUUIDPipe) id: string,
    @TenantContext() tenantId: string,
  ) {
    return this.scheduleService.removeTemplate(id, tenantId);
  }

  // ─── ScheduleException CRUD ────────────────────────────────────

  @Post(':id/exceptions')
  @Roles('admin', 'super_admin')
  @ApiOperation({
    summary:
      "Jadvalga istisno qo'shish: darsni bekor qilish yoki vaqtini o'zgartirish",
  })
  @ApiParam({
    name: 'id',
    format: 'uuid',
    description: 'ScheduleTemplate IDsi',
  })
  createException(
    @Param('id', ParseUUIDPipe) templateId: string,
    @TenantContext() tenantId: string,
    @Body() dto: CreateScheduleExceptionDto,
    @CurrentUser('id') createdById: string,
  ) {
    return this.scheduleService.createException(
      templateId,
      tenantId,
      dto,
      createdById,
    );
  }

  @Get(':id/exceptions')
  @Roles('admin', 'super_admin', 'teacher')
  @ApiOperation({ summary: 'Bitta dars jadvali uchun barcha istisno kunlar' })
  @ApiParam({
    name: 'id',
    format: 'uuid',
    description: 'ScheduleTemplate IDsi',
  })
  findExceptions(
    @Param('id', ParseUUIDPipe) templateId: string,
    @TenantContext() tenantId: string,
  ) {
    return this.scheduleService.findExceptions(templateId, tenantId);
  }
}

// ─── ScheduleException alohida controller (patch/delete) ────────

import { Controller as NestController } from '@nestjs/common';

@ApiTags('Dars Jadvali (Schedule)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@NestController('schedule-exceptions')
export class ScheduleExceptionController {
  constructor(private readonly scheduleService: ScheduleService) {}

  @Patch(':id')
  @Roles('admin', 'super_admin')
  @ApiOperation({ summary: 'Istisno kunni yangilash' })
  @ApiParam({ name: 'id', format: 'uuid' })
  updateException(
    @Param('id', ParseUUIDPipe) id: string,
    @TenantContext() tenantId: string,
    @Body() dto: CreateScheduleExceptionDto,
  ) {
    return this.scheduleService.updateException(id, tenantId, dto);
  }

  @Delete(':id')
  @Roles('admin', 'super_admin')
  @HttpCode(200)
  @ApiOperation({ summary: "Istisno kunni o'chirish" })
  @ApiParam({ name: 'id', format: 'uuid' })
  removeException(
    @Param('id', ParseUUIDPipe) id: string,
    @TenantContext() tenantId: string,
  ) {
    return this.scheduleService.removeException(id, tenantId);
  }
}

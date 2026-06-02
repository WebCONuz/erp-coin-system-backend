import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBearerAuth,
} from '@nestjs/swagger';

import { CreateCourseDto } from './dto/create-course.dto';
import { UpdateCourseDto } from './dto/update-course.dto';
import { QueryCourseDto } from './dto/query-course.dto';
import { CoursesService } from './courses.service';
import { TenantContext } from 'src/auth/decorators/tenant-context.decorator';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';

@ApiTags('Kurslar')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('courses')
export class CoursesController {
  constructor(private readonly coursesService: CoursesService) {}

  @Post()
  @ApiOperation({ summary: 'Kurs yaratish' })
  @ApiResponse({ status: 201, description: 'Kurs muvaffaqiyatli yaratildi' })
  create(
    @TenantContext() tenantId: string,
    @CurrentUser('id') createdById: string,
    @Body() dto: CreateCourseDto,
  ) {
    return this.coursesService.create(tenantId, createdById, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Barcha kurslarni olish (filtrlar bilan)' })
  @ApiResponse({ status: 200, description: 'Kurslar ro‘yxati' })
  findAll(@TenantContext() tenantId: string, @Query() query: QueryCourseDto) {
    return this.coursesService.findAll(query, tenantId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'ID bo‘yicha kursni olish' })
  @ApiParam({
    name: 'id',
    example: 1,
    description: 'Kurs IDsi',
  })
  @ApiResponse({ status: 200, description: 'Kurs topildi' })
  @ApiResponse({ status: 404, description: 'Kurs topilmadi' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @TenantContext() tenantId: string,
  ) {
    return this.coursesService.findOne(id, tenantId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Kursni yangilash' })
  @ApiParam({
    name: 'id',
    example: 1,
  })
  @ApiResponse({ status: 200, description: 'Kurs yangilandi' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCourseDto,
    @TenantContext() tenantId: string,
  ) {
    return this.coursesService.update(id, dto, tenantId);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Kursni o‘chirish' })
  @ApiParam({
    name: 'id',
    example: 1,
  })
  @ApiResponse({ status: 200, description: 'Kurs o‘chirildi' })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @TenantContext() tenantId: string,
    @CurrentUser('id') requesterId: string,
  ) {
    return this.coursesService.remove(id, tenantId, requesterId);
  }
}

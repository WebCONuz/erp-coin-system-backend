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
import { SubjectsService } from './subjects.service';
import { CreateSubjectDto } from './dto/create-subject.dto';
import { UpdateSubjectDto } from './dto/update-subject.dto';
import { QuerySubjectDto } from './dto/query-subject.dto';
import { TenantContext } from 'src/auth/decorators/tenant-context.decorator';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';

@ApiTags('Fanlar')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('subjects')
export class SubjectsController {
  constructor(private readonly subjectsService: SubjectsService) {}

  @Post()
  @Roles('admin', 'super_admin')
  @ApiOperation({ summary: 'Fan yaratish' })
  @ApiResponse({ status: 201, description: 'Fan muvaffaqiyatli yaratildi' })
  create(
    @TenantContext() tenantId: string,
    @CurrentUser('id') createdById: string,
    @Body() dto: CreateSubjectDto,
  ) {
    return this.subjectsService.create(tenantId, createdById, dto);
  }

  @Get()
  @Roles('admin', 'super_admin', 'teacher')
  @ApiOperation({ summary: 'Barcha fanlarni olish (filtrlar bilan)' })
  @ApiResponse({ status: 200, description: 'Fanlar ro‘yxati' })
  findAll(@TenantContext() tenantId: string, @Query() query: QuerySubjectDto) {
    return this.subjectsService.findAll(query, tenantId);
  }

  @Get(':id')
  @Roles('admin', 'super_admin', 'teacher')
  @ApiOperation({ summary: 'ID bo‘yicha fanni olish' })
  @ApiParam({
    name: 'id',
    format: 'uuid',
    example: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
  })
  @ApiResponse({ status: 200, description: 'Fan topildi' })
  @ApiResponse({ status: 404, description: 'Fan topilmadi' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @TenantContext() tenantId: string,
  ) {
    return this.subjectsService.findOne(id, tenantId);
  }

  @Patch(':id')
  @Roles('admin', 'super_admin')
  @ApiOperation({ summary: 'Fanni yangilash' })
  @ApiParam({
    name: 'id',
    format: 'uuid',
    example: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
  })
  @ApiResponse({ status: 200, description: 'Fan yangilandi' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSubjectDto,
    @TenantContext() tenantId: string,
  ) {
    return this.subjectsService.update(id, dto, tenantId);
  }

  @Delete(':id')
  @Roles('admin', 'super_admin')
  @ApiOperation({ summary: 'Fanni soft-delete qilish' })
  @ApiParam({
    name: 'id',
    format: 'uuid',
    example: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
  })
  @ApiResponse({ status: 200, description: 'Fan o‘chirildi' })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @TenantContext() tenantId: string,
    @CurrentUser('id') requesterId: string,
  ) {
    return this.subjectsService.remove(id, tenantId, requesterId);
  }
}

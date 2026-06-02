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
  ApiParam,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { GroupsService } from './groups.service';
import { CreateGroupDto } from './dto/create-group.dto';
import { UpdateGroupDto } from './dto/update-group.dto';
import { QueryGroupDto } from './dto/query-group.dto';
import { AddStudentDto } from './dto/add-student.dto';
import { TenantContext } from 'src/auth/decorators/tenant-context.decorator';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { AddStudentsBulkDto } from './dto/add-students-bulk.dto';

@ApiTags('Guruhlar')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('groups')
export class GroupsController {
  constructor(private readonly groupsService: GroupsService) {}

  @Post()
  @ApiOperation({ summary: 'Guruh yaratish' })
  create(
    @TenantContext() tenantId: string,
    @CurrentUser('id') createdById: string,
    @Body() dto: CreateGroupDto,
  ) {
    return this.groupsService.create(tenantId, createdById, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Guruhlar ro‘yxatini olish' })
  findAll(@TenantContext() tenantId: string, @Query() query: QueryGroupDto) {
    return this.groupsService.findAll(query, tenantId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'ID bo‘yicha guruh tafsilotlarini olish' })
  @ApiParam({ name: 'id', format: 'uuid' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @TenantContext() tenantId: string,
  ) {
    return this.groupsService.findOne(id, tenantId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Guruhni tahrirlash' })
  @ApiParam({ name: 'id', format: 'uuid' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateGroupDto,
    @TenantContext() tenantId: string,
  ) {
    return this.groupsService.update(id, dto, tenantId);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Guruhni o‘chirish (Soft-Delete)' })
  @ApiParam({ name: 'id', format: 'uuid' })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @TenantContext() tenantId: string,
  ) {
    return this.groupsService.remove(id, tenantId);
  }

  // ─────────────────────────────────────────
  // GROUP STUDENTS ENDPOINTS
  // ─────────────────────────────────────────

  @Post(':id/students')
  @ApiOperation({ summary: 'Guruhga o‘quvchi qo‘shish' })
  @ApiParam({ name: 'id', format: 'uuid', description: 'Guruh IDsi' })
  addStudent(
    @Param('id', ParseUUIDPipe) groupId: string,
    @TenantContext() tenantId: string,
    @CurrentUser('id') addedById: string,
    @Body() dto: AddStudentDto,
  ) {
    return this.groupsService.addStudent(groupId, tenantId, addedById, dto);
  }

  @Post(':id/students/bulk')
  @ApiOperation({ summary: 'Guruhga bir nechta o‘quvchini birdaniga qo‘shish' })
  @ApiParam({ name: 'id', format: 'uuid', description: 'Guruh IDsi' })
  addStudentsBulk(
    @Param('id', ParseUUIDPipe) groupId: string,
    @TenantContext() tenantId: string,
    @CurrentUser('id') addedById: string,
    @Body() dto: AddStudentsBulkDto,
  ) {
    return this.groupsService.addStudentsBulk(
      groupId,
      tenantId,
      addedById,
      dto,
    );
  }

  @Delete(':id/students/:studentId')
  @ApiOperation({ summary: 'Guruhdan o‘quvchini chiqarib yuborish' })
  @ApiParam({ name: 'id', format: 'uuid', description: 'Guruh IDsi' })
  @ApiParam({ name: 'studentId', format: 'uuid', description: 'Talaba IDsi' })
  removeStudent(
    @Param('id', ParseUUIDPipe) groupId: string,
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @TenantContext() tenantId: string,
  ) {
    return this.groupsService.removeStudent(groupId, studentId, tenantId);
  }
}

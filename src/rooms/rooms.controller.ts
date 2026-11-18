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
import { RoomsService } from './rooms.service';
import { CreateRoomDto } from './dto/create-room.dto';
import { UpdateRoomDto } from './dto/update-room.dto';
import { QueryRoomDto } from './dto/query-room.dto';
import { TenantContext } from 'src/auth/decorators/tenant-context.decorator';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { Roles } from 'src/auth/decorators/roles.decorator';

@ApiTags('Xonalar')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('rooms')
export class RoomsController {
  constructor(private readonly roomsService: RoomsService) {}

  @Post()
  @Roles('admin', 'super_admin')
  @ApiOperation({ summary: 'Yangi xona yaratish' })
  @ApiResponse({ status: 201, description: 'Xona muvaffaqiyatli yaratildi' })
  create(@TenantContext() tenantId: string, @Body() dto: CreateRoomDto) {
    return this.roomsService.create(tenantId, dto);
  }

  @Get()
  @Roles('admin', 'super_admin', 'teacher')
  @ApiOperation({ summary: 'Barcha xonalarni olish (filtrlar bilan)' })
  @ApiResponse({ status: 200, description: 'Xonalar ro‘yxati' })
  findAll(@TenantContext() tenantId: string, @Query() query: QueryRoomDto) {
    return this.roomsService.findAll(query, tenantId);
  }

  @Get(':id')
  @Roles('admin', 'super_admin', 'teacher')
  @ApiOperation({ summary: 'ID bo‘yicha xonani olish' })
  @ApiParam({
    name: 'id',
    format: 'uuid',
    example: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  })
  @ApiResponse({ status: 200, description: 'Xona topildi' })
  @ApiResponse({ status: 404, description: 'Xona topilmadi' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @TenantContext() tenantId: string,
  ) {
    return this.roomsService.findOne(id, tenantId);
  }

  @Patch(':id')
  @Roles('admin', 'super_admin')
  @ApiOperation({ summary: 'Xona ma’lumotlarini yangilash' })
  @ApiParam({
    name: 'id',
    format: 'uuid',
    example: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  })
  @ApiResponse({ status: 200, description: 'Xona yangilandi' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRoomDto,
    @TenantContext() tenantId: string,
  ) {
    return this.roomsService.update(id, dto, tenantId);
  }

  @Delete(':id')
  @Roles('admin', 'super_admin')
  @ApiOperation({ summary: 'Xonani soft-delete (arxiv) qilish' })
  @ApiParam({
    name: 'id',
    format: 'uuid',
    example: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  })
  @ApiResponse({ status: 200, description: 'Xona o‘chirildi' })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @TenantContext() tenantId: string,
  ) {
    return this.roomsService.remove(id, tenantId);
  }
}

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
  HttpCode,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto, ChangePasswordDto } from './dto/update-user.dto';
import { QueryUserDto } from './dto/query-user.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { TenantContext } from 'src/auth/decorators/tenant-context.decorator';

@ApiTags('Users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // ─── Yaratish ───────────────────────────────────────────────
  @Post()
  @Roles('admin', 'super_admin')
  @ApiOperation({ summary: 'Yangi foydalanuvchi yaratish' })
  @ApiResponse({ status: 201, description: 'Muvaffaqiyatli yaratildi' })
  @ApiResponse({ status: 409, description: 'Telefon yoki email band' })
  create(
    @Body() dto: CreateUserDto,
    @TenantContext() tenantId: string,
    @CurrentUser('id') createdById: string,
  ) {
    return this.usersService.create(dto, tenantId, createdById);
  }

  // ─── Ro'yxat ────────────────────────────────────────────────
  @Get()
  @Roles('admin', 'super_admin', 'teacher')
  @ApiOperation({ summary: "Foydalanuvchilar ro'yxati (filter + pagination)" })
  findAll(
    @Query() query: QueryUserDto,
    @TenantContext() tenantId: string,
    @CurrentUser('id') requesterId: string,
    @CurrentUser('role') role: string,
  ) {
    return this.usersService.findAll(query, tenantId, requesterId, role);
  }

  @Get('teachers')
  @Roles('admin', 'super_admin')
  @ApiOperation({ summary: "O'qituvchilar ro'yxati (filter + pagination)" })
  findAllTeachers(
    @Query() query: QueryUserDto,
    @TenantContext() tenantId: string,
    @CurrentUser('id') requesterId: string,
  ) {
    return this.usersService.findAllTeachers(query, tenantId, requesterId);
  }

  // ─── O'z profili ─────────────────────────────────────────────
  @Get('me')
  @ApiOperation({ summary: "O'z profil ma'lumotlari" })
  getMe(@CurrentUser('id') userId: string) {
    // Barcha rollar o'z profilini ko'ra oladi
    return this.usersService.getProfile(userId);
  }

  // ─── Bitta user ──────────────────────────────────────────────
  @Get(':id')
  @Roles('admin', 'super_admin', 'teacher')
  @ApiOperation({ summary: "Bitta foydalanuvchi ma'lumotlari" })
  @ApiParam({ name: 'id', description: 'User UUID' })
  @ApiResponse({ status: 404, description: 'Topilmadi' })
  @ApiResponse({ status: 403, description: "Ruxsat yo'q" })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @TenantContext() tenantId: string,
    @CurrentUser('id') requesterId: string,
    @CurrentUser('role') role: string,
  ) {
    return this.usersService.findOne(id, tenantId, role, requesterId);
  }

  // ─── Yangilash ───────────────────────────────────────────────
  @Patch(':id')
  @ApiOperation({ summary: "Foydalanuvchi ma'lumotlarini yangilash" })
  @ApiParam({ name: 'id', description: 'User UUID' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
    @TenantContext() tenantId: string,
    @CurrentUser('id') requesterId: string,
    @CurrentUser('role') role: string,
  ) {
    return this.usersService.update(id, dto, tenantId, role, requesterId);
  }

  // ─── Parol o'zgartirish ──────────────────────────────────────
  @Patch(':id/change-password')
  @HttpCode(200)
  @ApiOperation({ summary: "Parol o'zgartirish" })
  @ApiParam({ name: 'id', description: 'User UUID' })
  @ApiResponse({ status: 403, description: "Eski parol noto'g'ri" })
  changePassword(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangePasswordDto,
    @CurrentUser('id') requesterId: string,
    @CurrentUser('role') role: string,
  ) {
    return this.usersService.changePassword(id, dto, requesterId, role);
  }

  // ─── Arxivlash (soft delete) ─────────────────────────────────
  @Delete(':id')
  @Roles('admin', 'super_admin')
  @HttpCode(200)
  @ApiOperation({ summary: "Foydalanuvchini arxivlash (o'chirish emas)" })
  @ApiParam({ name: 'id', description: 'User UUID' })
  @ApiResponse({ status: 403, description: "Super adminni arxivlab bo'lmaydi" })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @TenantContext() tenantId: string,
    @CurrentUser('id') archiverId: string,
    @CurrentUser('role') role: string,
  ) {
    return this.usersService.remove(id, tenantId, archiverId, role);
  }

  // ─── Arxivdan qaytarish ──────────────────────────────────────
  @Patch(':id/restore')
  @Roles('admin', 'super_admin')
  @HttpCode(200)
  @ApiOperation({ summary: 'Arxivlangan foydalanuvchini tiklash' })
  @ApiParam({ name: 'id', description: 'User UUID' })
  restore(
    @Param('id', ParseUUIDPipe) id: string,
    @TenantContext() tenantId: string,
    @CurrentUser('role') role: string,
  ) {
    return this.usersService.restore(id, tenantId, role);
  }
}

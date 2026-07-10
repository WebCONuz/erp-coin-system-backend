import {
  Controller,
  Get,
  Delete,
  Patch,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  HttpCode,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { StudentsService } from './students.service';
import { ArchiveStudentDto } from './dto/archive-student.dto';
import { QueryStudentDto } from './dto/query-student.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import { TenantContext } from 'src/auth/decorators/tenant-context.decorator';

const avatarStorage = diskStorage({
  destination: './uploads/avatars',
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${unique}${extname(file.originalname)}`);
  },
});

@ApiTags('Students')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('students')
export class StudentsController {
  constructor(private readonly studentsService: StudentsService) {}

  // ─── Ro'yxat (isDeleted:false default) ─────────────────────────
  @Get()
  @Roles('admin', 'super_admin', 'teacher')
  @ApiOperation({
    summary: "O'quvchilar ro'yxati (isDeleted:false, isActive filter bilan)",
  })
  findAll(
    @TenantContext() tenantId: string,
    @Query() query: QueryStudentDto,
    @CurrentUser('id') requesterId: string,
    @CurrentUser('role') role: string,
  ) {
    return this.studentsService.findAll(query, tenantId, role, requesterId);
  }

  // ─── Barcha studentlar (o'chirilganlar bilan) — faqat super_admin ──
  @Get('all')
  @Roles('super_admin')
  @ApiOperation({
    summary:
      "Barcha studentlar ro'yxati — isDeleted holatidan qat'iy nazar (faqat super_admin)",
  })
  findAllIncludingDeleted(
    @TenantContext() tenantId: string,
    @Query() query: QueryStudentDto,
  ) {
    return this.studentsService.findAllIncludingDeleted(query, tenantId);
  }

  // ─── To'liq profil ──────────────────────────────────────────────
  @Get(':id')
  @Roles('admin', 'super_admin', 'teacher')
  @ApiOperation({
    summary:
      "Student to'liq profili: wallet, guruhlar, davomat, tanga tarixi, statistika",
  })
  @ApiParam({ name: 'id', description: 'Student UUID' })
  getFullProfile(
    @Param('id', ParseUUIDPipe) id: string,
    @TenantContext() tenantId: string,
    @CurrentUser('id') requesterId: string,
    @CurrentUser('role') role: string,
  ) {
    return this.studentsService.getFullProfile(id, tenantId, role, requesterId);
  }

  // ─── Arxivlash / O'chirish / Tiklash ───────────────────────────
  @Delete(':id')
  @Roles('admin', 'super_admin')
  @HttpCode(200)
  @ApiOperation({
    summary:
      "Student holatini o'zgartirish: arxivlash / arxivdan qaytarish / soft-delete / tiklash",
  })
  @ApiParam({ name: 'id', description: 'Student UUID' })
  archiveOrDelete(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ArchiveStudentDto,
    @TenantContext() tenantId: string,
    @CurrentUser('id') requesterId: string,
    @CurrentUser('role') role: string,
  ) {
    return this.studentsService.archiveOrDelete(
      id,
      dto,
      tenantId,
      requesterId,
      role,
    );
  }

  // ─── Avatar yuklash ─────────────────────────────────────────────
  @Patch(':id/avatar')
  @Roles('admin', 'super_admin')
  @UseInterceptors(
    FileInterceptor('avatar', {
      storage: avatarStorage,
      limits: { fileSize: 2 * 1024 * 1024 }, // 2 MB
      fileFilter: (_req, file, cb) => {
        if (!file.mimetype.match(/^image\/(jpeg|png|webp|gif)$/)) {
          cb(
            new BadRequestException(
              'Faqat JPEG, PNG, WebP yoki GIF ruxsat etilgan',
            ),
            false,
          );
          return;
        }
        cb(null, true);
      },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { avatar: { type: 'string', format: 'binary' } },
    },
  })
  @ApiOperation({ summary: 'Student avatar rasmini yuklash (max 2 MB)' })
  @ApiParam({ name: 'id', description: 'Student UUID' })
  uploadAvatar(
    @Param('id', ParseUUIDPipe) id: string,
    @TenantContext() tenantId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('Rasm fayli yuklanmadi');
    const avatarUrl = `/uploads/avatars/${file.filename}`;
    return this.studentsService.updateAvatar(id, tenantId, avatarUrl);
  }
}

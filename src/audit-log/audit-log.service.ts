import { TenantQueryDto } from 'src/common/dto/tenant-query.dto';
import { Injectable, Logger } from '@nestjs/common';
import { getRequestContext } from 'src/common/context/request-context';
import { AuditEntry, buildAuditData } from './utils/audit-entry';
import { PrismaService } from 'src/prisma/prisma.service';
import { AuditActionType, Prisma } from 'src/generated/prisma/client';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateOnly } from 'src/common/dto/is-date-only.decorator';
import {
  addDays,
  getTenantTimezone,
  zonedDayStart,
} from 'src/common/utils/tenant-time';

export class QueryAuditLogDto extends TenantQueryDto {
  @ApiPropertyOptional({ enum: AuditActionType })
  @IsOptional()
  @IsEnum(AuditActionType)
  actionType?: AuditActionType;

  @ApiPropertyOptional({
    example: 'User',
    description: 'Entitet turi: User, Group, Session ...',
  })
  @IsOptional()
  @IsString()
  entityType?: string;

  @ApiPropertyOptional({ example: 'uuid-of-entity' })
  @IsOptional()
  @IsUUID()
  entityId?: string;

  @ApiPropertyOptional({
    example: 'uuid-of-user',
    description: 'Amalni bajargan foydalanuvchi',
  })
  @IsOptional()
  @IsUUID()
  userId?: string;

  @ApiPropertyOptional({
    example: '2026-01-01',
    description: 'Boshlanish sanasi',
  })
  @IsOptional()
  @IsDateOnly()
  fromDate?: string;

  @ApiPropertyOptional({ example: '2026-12-31', description: 'Tugash sanasi' })
  @IsOptional()
  @IsDateOnly()
  toDate?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 30 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 30;
}

@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Audit yozuvi uchun `data` — chaqiruvchi o'z tranzaksiyasida yozadi:
   * `tx.auditLog.create({ data: this.audit.data({...}) })` (interaktiv tx) yoki
   * `this.prisma.$transaction([..., this.prisma.auditLog.create({ data })])` (massiv tx).
   * Shunda amal va uning audit izi birga saqlanadi yoki birga bekor bo'ladi.
   * IP va user-agent joriy so'rov kontekstidan olinadi.
   */
  data(entry: AuditEntry): Prisma.AuditLogUncheckedCreateInput {
    return buildAuditData(entry, getRequestContext());
  }

  /**
   * Tranzaksiyadan tashqarida (asosiy amal allaqachon saqlangan) — audit xatosi amalni
   * buzmasligi kerak: aks holda klient xato ko'rib, so'rovni takrorlaydi (masalan coin
   * ikki marta beriladi). Xato faqat logga yoziladi.
   */
  async recordSafe(entry: AuditEntry): Promise<void> {
    try {
      await this.prisma.auditLog.create({ data: this.data(entry) });
    } catch (err) {
      this.logger.error(
        `Audit yozilmadi [${entry.action} ${entry.entityType} ${entry.entityId}]: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  async findAll(query: QueryAuditLogDto, tenantId: string) {
    const {
      actionType,
      entityType,
      entityId,
      userId,
      fromDate,
      toDate,
      page = 1,
      limit = 30,
    } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.AuditLogWhereInput = { tenantId };

    if (actionType) where.actionType = actionType;
    if (entityType) where.entityType = entityType;
    if (entityId) where.entityId = entityId;
    if (userId) where.createdBy = userId;
    if (fromDate || toDate) {
      // Sanalar tenant mahalliy kunlari: from — kun boshidan, to — kun oxirigacha
      const tz = await getTenantTimezone(this.prisma, tenantId);
      where.createdAt = {
        ...(fromDate ? { gte: zonedDayStart(tz, fromDate) } : {}),
        ...(toDate ? { lt: zonedDayStart(tz, addDays(toDate, 1)) } : {}),
      };
    }

    const [data, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          createdByUser: { select: { id: true, fullName: true, phone: true } },
        },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }
}

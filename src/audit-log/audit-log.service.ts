import { Injectable } from '@nestjs/common';
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

export class QueryAuditLogDto {
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
  @IsString()
  fromDate?: string;

  @ApiPropertyOptional({ example: '2026-12-31', description: 'Tugash sanasi' })
  @IsOptional()
  @IsString()
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
  constructor(private readonly prisma: PrismaService) {}

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
      where.createdAt = {
        ...(fromDate ? { gte: new Date(fromDate) } : {}),
        ...(toDate ? { lte: new Date(toDate + 'T23:59:59') } : {}),
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

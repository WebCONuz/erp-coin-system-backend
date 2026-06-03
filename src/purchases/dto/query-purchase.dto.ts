import { IsOptional, IsNumber, Min, IsUUID, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PurchaseStatus } from 'src/generated/prisma/enums';

export class QueryPurchaseDto {
  @ApiPropertyOptional({ description: 'Faqat super_admin va creator uchun' })
  @IsOptional()
  @IsUUID()
  tenantId?: string;

  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ example: 10, default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  limit?: number = 10;

  @ApiPropertyOptional({
    description: 'Aniq bir talabaning xaridlarini ko‘rish',
  })
  @IsOptional()
  @IsUUID()
  studentId?: string;

  @ApiPropertyOptional({
    description: 'Aniq bir sovg‘a bo‘yicha xaridlarni ko‘rish',
  })
  @IsOptional()
  @IsUUID()
  rewardId?: string;

  @ApiPropertyOptional({
    enum: PurchaseStatus,
    description: 'Holat bo‘yicha filtr',
  })
  @IsOptional()
  @IsEnum(PurchaseStatus)
  status?: PurchaseStatus;
}

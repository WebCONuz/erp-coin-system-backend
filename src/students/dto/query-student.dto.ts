import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class QueryStudentDto {
  @ApiPropertyOptional({ description: 'Faqat super_admin uchun' })
  @IsOptional()
  @IsUUID()
  tenantId?: string;

  @ApiPropertyOptional({ description: "Ism yoki telefon bo'yicha qidirish" })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: "Guruh ID bo'yicha filtr" })
  @IsOptional()
  @IsUUID()
  groupId?: string;

  @ApiPropertyOptional({
    description:
      "true — faqat faollar, false — faqat arxivlanganlar, bo'sh — ikkalasi (o'chirilmaganlar)",
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return undefined;
  })
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}

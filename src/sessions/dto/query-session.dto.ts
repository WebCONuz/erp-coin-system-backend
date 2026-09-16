import {
  IsOptional,
  IsNumber,
  Min,
  IsUUID,
  IsEnum,
  IsDateString,
  IsBoolean,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { SessionType } from 'src/generated/prisma/enums';

export class QuerySessionDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  tenantId?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ example: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  limit?: number = 10;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  groupId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  teacherId?: string;

  @ApiPropertyOptional({ enum: SessionType })
  @IsOptional()
  @IsEnum(SessionType)
  sessionType?: SessionType;

  @ApiPropertyOptional({ example: '2026-06-03' })
  @IsOptional()
  @IsDateString()
  date?: string;

  @ApiPropertyOptional({
    description:
      "Yo'qlama qilingan/qilinmagan sessiyalar bo'yicha filtr. false berilganda faqat vaqti (endTime) allaqachon o'tgan, lekin hali yo'qlama qilinmagan sessiyalar qaytadi — hali vaqti kelmagan sessiyalar 'tekshirilmagan' sifatida hisoblanmaydi.",
    example: false,
  })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  isChecked?: boolean;
}

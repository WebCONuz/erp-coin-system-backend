import { IsOptional, IsNumber, Min, IsUUID, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { CoinDirection, SourceType } from 'src/generated/prisma/enums';

export class QueryCoinTransactionDto {
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
    description: 'Aniq bir talabaning tranzaksiyalarini ko‘rish uchun',
  })
  @IsOptional()
  @IsUUID()
  studentId?: string;

  @ApiPropertyOptional({
    description: 'Tranzaksiyani amalga oshirgan o‘qituvchi bo‘yicha filtr',
  })
  @IsOptional()
  @IsUUID()
  teacherId?: string;

  @ApiPropertyOptional({ enum: CoinDirection })
  @IsOptional()
  @IsEnum(CoinDirection)
  direction?: CoinDirection;

  @ApiPropertyOptional({ enum: SourceType })
  @IsOptional()
  @IsEnum(SourceType)
  sourceType?: SourceType;
}

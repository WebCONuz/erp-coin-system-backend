import {
  IsOptional,
  IsNumber,
  Min,
  IsEnum,
  IsDateString,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { CoinDirection, SourceType } from 'src/generated/prisma/enums';

export class QueryMyCoinHistoryDto {
  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ example: 20, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  limit?: number = 20;

  @ApiPropertyOptional({ enum: CoinDirection })
  @IsOptional()
  @IsEnum(CoinDirection)
  direction?: CoinDirection;

  @ApiPropertyOptional({ enum: SourceType })
  @IsOptional()
  @IsEnum(SourceType)
  sourceType?: SourceType;

  @ApiPropertyOptional({ example: '2026-08-01' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ example: '2026-08-31' })
  @IsOptional()
  @IsDateString()
  to?: string;
}

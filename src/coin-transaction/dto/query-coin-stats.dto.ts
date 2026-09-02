import { IsOptional, IsIn, IsNumber, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class QueryCoinStatsDto {
  @ApiPropertyOptional({
    enum: ['week', 'month'],
    default: 'week',
    description:
      "Guruhlash davri: 'week' — kunlik (so'nggi 7 kun), 'month' — haftalik (so'nggi 4 hafta)",
  })
  @IsOptional()
  @IsIn(['week', 'month'])
  period?: 'week' | 'month' = 'week';

  @ApiPropertyOptional({
    example: 7,
    default: 7,
    description: 'Nechta bucket (kun/hafta) qaytarilishi kerak',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(52)
  count?: number = 7;
}

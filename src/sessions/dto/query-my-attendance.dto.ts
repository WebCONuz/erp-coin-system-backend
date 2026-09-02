import {
  IsOptional,
  IsNumber,
  Min,
  IsUUID,
  IsDateString,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class QueryMyAttendanceDto {
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

  @ApiPropertyOptional({ description: 'Muayyan guruh bo‘yicha filtr' })
  @IsOptional()
  @IsUUID()
  groupId?: string;

  @ApiPropertyOptional({
    example: '2026-08-01',
    description: 'Boshlanish sanasi',
  })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ example: '2026-08-31', description: 'Tugash sanasi' })
  @IsOptional()
  @IsDateString()
  to?: string;
}

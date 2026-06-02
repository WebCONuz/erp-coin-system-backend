import { IsOptional, IsNumber, Min, IsString, IsUUID } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class QueryCourseDto {
  @ApiPropertyOptional({ description: 'Faqat super_admin uchun' })
  @IsOptional()
  @IsUUID()
  tenantId?: string; // faqat super_admin uchun

  @ApiPropertyOptional({
    example: 1,
    description: 'Sahifa raqami (pagination)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    example: 10,
    description: 'Sahifa bo‘yicha elementlar',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  limit?: number = 10;

  @ApiPropertyOptional({
    example: 'node',
    description: 'Kurs nomi bo‘yicha qidiruv (case-insensitive)',
  })
  @IsOptional()
  @IsString()
  search?: string;
}

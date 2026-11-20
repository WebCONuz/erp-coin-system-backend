import { TenantQueryDto } from 'src/common/dto/tenant-query.dto';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { IsDateOnly } from 'src/common/dto/is-date-only.decorator';

export class CreateHolidayDto {
  @ApiProperty({ example: '2026-12-31', description: 'Sana (YYYY-MM-DD)' })
  @IsDateOnly()
  date: string;

  @ApiProperty({ example: 'Yangi yil' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;
}

export class QueryHolidayDto extends TenantQueryDto {
  @ApiPropertyOptional({ example: '2026-01-01' })
  @IsOptional()
  @IsDateOnly()
  from?: string;

  @ApiPropertyOptional({ example: '2026-12-31' })
  @IsOptional()
  @IsDateOnly()
  to?: string;
}

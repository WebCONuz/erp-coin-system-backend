import { IsOptional, IsUUID } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationQueryDto } from 'src/common/dto/pagination-query.dto';
import { IsDateOnly } from 'src/common/dto/is-date-only.decorator';

export class QueryMyAttendanceDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Muayyan guruh bo‘yicha filtr' })
  @IsOptional()
  @IsUUID()
  groupId?: string;

  @ApiPropertyOptional({
    example: '2026-08-01',
    description: 'Boshlanish sanasi',
  })
  @IsOptional()
  @IsDateOnly()
  from?: string;

  @ApiPropertyOptional({ example: '2026-08-31', description: 'Tugash sanasi' })
  @IsOptional()
  @IsDateOnly()
  to?: string;
}

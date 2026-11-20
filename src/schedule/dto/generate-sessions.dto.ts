import { IsNotEmpty, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { IsDateOnly } from 'src/common/dto/is-date-only.decorator';

export class GenerateSessionsDto {
  @ApiProperty({ example: 'group-uuid', description: 'Guruh IDsi' })
  @IsUUID()
  @IsNotEmpty()
  groupId: string;

  @ApiProperty({
    example: '2026-09-01',
    description: 'Boshlanish sanasi (YYYY-MM-DD)',
  })
  @IsDateOnly()
  fromDate: string;

  @ApiProperty({
    example: '2026-09-30',
    description: 'Tugash sanasi (YYYY-MM-DD)',
  })
  @IsDateOnly()
  toDate: string;
}

import { IsOptional, IsString, IsUUID, Matches } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateScheduleTemplateDto {
  @ApiPropertyOptional({ example: '10:00' })
  @IsOptional()
  @IsString()
  @Matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, {
    message: 'Vaqt formati HH:MM',
  })
  startTime?: string;

  @ApiPropertyOptional({ example: '12:00' })
  @IsOptional()
  @IsString()
  @Matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, {
    message: 'Vaqt formati HH:MM',
  })
  endTime?: string;

  @ApiPropertyOptional({ example: 'room-uuid' })
  @IsOptional()
  @IsUUID()
  roomId?: string;
}

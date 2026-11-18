import { IsEnum, IsOptional, IsString, IsUUID, Matches } from 'class-validator';
import { HHMM_MESSAGE, HHMM_REGEX } from 'src/common/utils/tenant-time';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Weekday } from 'src/generated/prisma/enums';

export class UpdateScheduleTemplateDto {
  @ApiPropertyOptional({ example: 'thursday', enum: Weekday })
  @IsOptional()
  @IsEnum(Weekday)
  weekday?: Weekday;

  @ApiPropertyOptional({ example: '10:00' })
  @IsOptional()
  @IsString()
  @Matches(HHMM_REGEX, { message: HHMM_MESSAGE })
  startTime?: string;

  @ApiPropertyOptional({ example: '12:00' })
  @IsOptional()
  @IsString()
  @Matches(HHMM_REGEX, { message: HHMM_MESSAGE })
  endTime?: string;

  @ApiPropertyOptional({ example: 'room-uuid' })
  @IsOptional()
  @IsUUID()
  roomId?: string;

  @ApiPropertyOptional({ example: 'teacher-uuid' })
  @IsOptional()
  @IsUUID()
  teacherId?: string;

  @ApiPropertyOptional({ example: 'subject-uuid' })
  @IsOptional()
  @IsUUID()
  subjectId?: string;
}

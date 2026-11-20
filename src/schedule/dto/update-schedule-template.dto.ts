import { IsDateOnly } from 'src/common/dto/is-date-only.decorator';
import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  ValidateIf,
} from 'class-validator';
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

  @ApiPropertyOptional({
    example: '2026-09-01',
    nullable: true,
    description: 'Amal qilish boshlanishi. null — cheklovni olib tashlash',
  })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsDateOnly()
  validFrom?: string | null;

  @ApiPropertyOptional({
    example: '2026-12-31',
    nullable: true,
    description: 'Amal qilish tugashi. null — cheklovni olib tashlash',
  })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsDateOnly()
  validTo?: string | null;
}

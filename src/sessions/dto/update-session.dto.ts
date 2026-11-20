import {
  IsString,
  IsOptional,
  IsEnum,
  IsUUID,
  Matches,
  IsInt,
  Min,
  Max,
  MaxLength,
} from 'class-validator';
import { HHMM_MESSAGE, HHMM_REGEX } from 'src/common/utils/tenant-time';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { EvaluationMode, SessionType } from 'src/generated/prisma/enums';

export class UpdateSessionDto {
  @ApiPropertyOptional({
    example: '14:00',
    description: 'Yangi boshlanish vaqti (HH:MM)',
  })
  @IsOptional()
  @IsString()
  @Matches(HHMM_REGEX, { message: HHMM_MESSAGE })
  startTime?: string;

  @ApiPropertyOptional({
    example: '15:30',
    description: 'Yangi tugash vaqti (HH:MM)',
  })
  @IsOptional()
  @IsString()
  @Matches(HHMM_REGEX, { message: HHMM_MESSAGE })
  endTime?: string;

  @ApiPropertyOptional({ enum: SessionType, description: 'Dars turi' })
  @IsOptional()
  @IsEnum(SessionType)
  sessionType?: SessionType;

  @ApiPropertyOptional({
    enum: EvaluationMode,
    description:
      "Tekshirish rejimi (faqat turning allowedModes ichidan). Tekshirilgan sessiyada o'zgartirib bo'lmaydi",
  })
  @IsOptional()
  @IsEnum(EvaluationMode)
  evaluationMode?: EvaluationMode;

  @ApiPropertyOptional({
    example: 100,
    nullable: true,
    description: 'Maksimal ball (scored rejim). null — chegarasiz',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100000)
  maxScore?: number | null;

  @ApiPropertyOptional({ example: 'Mavzu nomi' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  topic?: string;

  @ApiPropertyOptional({ example: 'room-uuid' })
  @IsOptional()
  @IsUUID()
  roomId?: string;

  @ApiPropertyOptional({ example: 'teacher-uuid' })
  @IsOptional()
  @IsUUID()
  teacherId?: string;

  @ApiPropertyOptional({ example: 'subject-uuid', description: 'Dars fani' })
  @IsOptional()
  @IsUUID()
  subjectId?: string;
}

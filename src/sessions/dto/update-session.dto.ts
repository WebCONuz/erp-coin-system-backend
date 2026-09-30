import {
  IsString,
  IsOptional,
  IsEnum,
  IsUUID,
  Matches,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { EvaluationMode, SessionType } from 'src/generated/prisma/enums';

export class UpdateSessionDto {
  @ApiPropertyOptional({
    example: '14:00',
    description: 'Yangi boshlanish vaqti (HH:MM)',
  })
  @IsOptional()
  @IsString()
  @Matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, {
    message: 'Vaqt formati HH:MM',
  })
  startTime?: string;

  @ApiPropertyOptional({
    example: '15:30',
    description: 'Yangi tugash vaqti (HH:MM)',
  })
  @IsOptional()
  @IsString()
  @Matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, {
    message: 'Vaqt formati HH:MM',
  })
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

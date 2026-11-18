import {
  IsBoolean,
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  IsUUID,
} from 'class-validator';
import { HHMM_MESSAGE, HHMM_REGEX } from 'src/common/utils/tenant-time';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateScheduleExceptionDto {
  @ApiProperty({
    example: '2026-08-25',
    description: 'Istisno sanasi (YYYY-MM-DD)',
  })
  @IsDateString()
  @IsNotEmpty()
  exceptionDate: string;

  @ApiProperty({
    example: true,
    description:
      "true — dars bekor qilingan; false — vaqt, xona yoki o'qituvchi o'zgardi",
  })
  @IsBoolean()
  @IsNotEmpty()
  isCancelled: boolean;

  @ApiPropertyOptional({
    example: '10:00',
    description:
      "isCancelled:false — yangi boshlanish vaqti (endTime bilan birga; vaqt o'zgarmasa berilmaydi)",
  })
  @IsOptional()
  @IsString()
  @Matches(HHMM_REGEX, { message: HHMM_MESSAGE })
  startTime?: string;

  @ApiPropertyOptional({
    example: '12:00',
    description: "isCancelled:false bo'lsa yangi tugash vaqti",
  })
  @IsOptional()
  @IsString()
  @Matches(HHMM_REGEX, { message: HHMM_MESSAGE })
  endTime?: string;

  @ApiPropertyOptional({
    example: 'room-uuid',
    description: "Shu kun dars boshqa xonada bo'lsa (isCancelled:false)",
  })
  @IsOptional()
  @IsUUID()
  roomId?: string;

  @ApiPropertyOptional({
    example: 'teacher-uuid',
    description:
      "Shu kun darsni o'rinbosar o'qituvchi o'tsa (isCancelled:false)",
  })
  @IsOptional()
  @IsUUID()
  teacherId?: string;

  @ApiPropertyOptional({ example: "Bayram sababli dars ko'chirildi" })
  @IsOptional()
  @IsString()
  note?: string;
}

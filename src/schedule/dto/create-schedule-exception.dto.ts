import {
  IsBoolean,
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  ValidateIf,
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
    description: "true — dars bekor qilingan; false — vaqt o'zgardi",
  })
  @IsBoolean()
  @IsNotEmpty()
  isCancelled: boolean;

  @ApiPropertyOptional({
    example: '10:00',
    description: "isCancelled:false bo'lsa yangi boshlanish vaqti",
  })
  @ValidateIf((o: CreateScheduleExceptionDto) => !o.isCancelled)
  @IsString()
  @Matches(HHMM_REGEX, { message: HHMM_MESSAGE })
  startTime?: string;

  @ApiPropertyOptional({
    example: '12:00',
    description: "isCancelled:false bo'lsa yangi tugash vaqti",
  })
  @ValidateIf((o: CreateScheduleExceptionDto) => !o.isCancelled)
  @IsString()
  @Matches(HHMM_REGEX, { message: HHMM_MESSAGE })
  endTime?: string;

  @ApiPropertyOptional({ example: "Bayram sababli dars ko'chirildi" })
  @IsOptional()
  @IsString()
  note?: string;
}

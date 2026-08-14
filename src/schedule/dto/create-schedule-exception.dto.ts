import {
  IsBoolean,
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  ValidateIf,
} from 'class-validator';
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
  @Matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, {
    message: 'Vaqt formati HH:MM',
  })
  startTime?: string;

  @ApiPropertyOptional({
    example: '12:00',
    description: "isCancelled:false bo'lsa yangi tugash vaqti",
  })
  @ValidateIf((o: CreateScheduleExceptionDto) => !o.isCancelled)
  @IsString()
  @Matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, {
    message: 'Vaqt formati HH:MM',
  })
  endTime?: string;

  @ApiPropertyOptional({ example: "Bayram sababli dars ko'chirildi" })
  @IsOptional()
  @IsString()
  note?: string;
}

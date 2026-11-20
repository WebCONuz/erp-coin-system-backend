import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  IsUUID,
  ValidateIf,
} from 'class-validator';
import { HHMM_MESSAGE, HHMM_REGEX } from 'src/common/utils/tenant-time';
import { IsDateOnly } from 'src/common/dto/is-date-only.decorator';
import {
  ApiProperty,
  ApiPropertyOptional,
  OmitType,
  PartialType,
} from '@nestjs/swagger';

export class CreateScheduleExceptionDto {
  @ApiProperty({
    example: '2026-08-25',
    description: 'Istisno sanasi (YYYY-MM-DD)',
  })
  @IsDateOnly()
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
  @MaxLength(300)
  note?: string;
}

// PATCH /schedule-exceptions/:id — qisman yangilash: faqat yuborilgan maydonlar o'zgaradi.
// `startTime`/`endTime`/`roomId`/`teacherId` uchun `null` — shablondagi qiymatga qaytarish.
// `exceptionDate` o'zgartirilmaydi (boshqa sana kerak bo'lsa — istisnoni o'chirib, yangisini qo'shing);
// eski klientlar uni yuborsa xato bermasligi uchun qabul qilinadi va e'tiborsiz qoldiriladi.
export class UpdateScheduleExceptionDto extends PartialType(
  OmitType(CreateScheduleExceptionDto, [
    'startTime',
    'endTime',
    'roomId',
    'teacherId',
  ] as const),
) {
  @ApiPropertyOptional({ example: '10:00', nullable: true })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  @Matches(HHMM_REGEX, { message: HHMM_MESSAGE })
  startTime?: string | null;

  @ApiPropertyOptional({ example: '12:00', nullable: true })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  @Matches(HHMM_REGEX, { message: HHMM_MESSAGE })
  endTime?: string | null;

  @ApiPropertyOptional({ example: 'room-uuid', nullable: true })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsUUID()
  roomId?: string | null;

  @ApiPropertyOptional({ example: 'teacher-uuid', nullable: true })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsUUID()
  teacherId?: string | null;
}

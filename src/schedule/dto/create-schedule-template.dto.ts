import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
} from 'class-validator';
import { HHMM_MESSAGE, HHMM_REGEX } from 'src/common/utils/tenant-time';
import { IsDateOnly } from 'src/common/dto/is-date-only.decorator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Weekday } from 'src/generated/prisma/enums';

export class CreateScheduleTemplateDto {
  @ApiProperty({
    example: 'monday',
    enum: Weekday,
    description: 'Hafta kuni',
  })
  @IsEnum(Weekday)
  @IsNotEmpty()
  weekday: Weekday;

  @ApiProperty({ example: '09:00', description: 'Boshlanish vaqti (HH:MM)' })
  @IsString()
  @IsNotEmpty()
  @Matches(HHMM_REGEX, { message: HHMM_MESSAGE })
  startTime: string;

  @ApiProperty({ example: '11:00', description: 'Tugash vaqti (HH:MM)' })
  @IsString()
  @IsNotEmpty()
  @Matches(HHMM_REGEX, { message: HHMM_MESSAGE })
  endTime: string;

  @ApiProperty({ example: 'group-uuid', description: 'Guruh IDsi' })
  @IsUUID()
  @IsNotEmpty()
  groupId: string;

  @ApiProperty({ example: 'room-uuid', description: 'Xona IDsi' })
  @IsUUID()
  @IsNotEmpty()
  roomId: string;

  @ApiPropertyOptional({
    example: 'teacher-uuid',
    description:
      "Bu shablon uchun mas'ul o'qituvchi (berilmasa guruh o'qituvchisi ishlatiladi)",
  })
  @IsOptional()
  @IsUUID()
  teacherId?: string;

  @ApiPropertyOptional({
    example: 'subject-uuid',
    description:
      "Bu dars slotining fani (maktab uchun; o'quv markaz uchun berilmasligi mumkin)",
  })
  @IsOptional()
  @IsUUID()
  subjectId?: string;

  @ApiPropertyOptional({
    example: '2026-09-01',
    description: 'Amal qilish boshlanishi (YYYY-MM-DD). Berilmasa — cheklovsiz',
  })
  @IsOptional()
  @IsDateOnly()
  validFrom?: string;

  @ApiPropertyOptional({
    example: '2026-12-31',
    description:
      'Amal qilish tugashi (YYYY-MM-DD, shu kun ham kiradi). Berilmasa — cheklovsiz',
  })
  @IsOptional()
  @IsDateOnly()
  validTo?: string;

  @ApiPropertyOptional({ description: 'Faqat super_admin uchun' })
  @IsOptional()
  @IsUUID()
  tenantId?: string;
}

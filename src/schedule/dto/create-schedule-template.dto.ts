import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
} from 'class-validator';
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
  @Matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, {
    message: 'Vaqt formati HH:MM',
  })
  startTime: string;

  @ApiProperty({ example: '11:00', description: 'Tugash vaqti (HH:MM)' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, {
    message: 'Vaqt formati HH:MM',
  })
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

  @ApiPropertyOptional({ description: 'Faqat super_admin uchun' })
  @IsOptional()
  @IsUUID()
  tenantId?: string;
}

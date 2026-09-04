import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsUUID,
  IsDateString,
  Matches,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SessionType } from 'src/generated/prisma/enums';

export class CreateSessionDto {
  @ApiProperty({
    example: '2026-06-03',
    description: 'Dars bo‘ladigan sana (YYYY-MM-DD)',
  })
  @IsDateString()
  @IsNotEmpty()
  sessionDate: string;

  @ApiProperty({
    example: '14:00',
    description: 'Dars boshlanish vaqti (HH:MM)',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, {
    message: 'Vaqt formati HH:MM bo‘lishi kerak',
  })
  startTime: string;

  @ApiProperty({ example: '15:30', description: 'Dars tugash vaqti (HH:MM)' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, {
    message: 'Vaqt formati HH:MM bo‘lishi kerak',
  })
  endTime: string;

  @ApiProperty({
    example: 'lesson',
    enum: SessionType,
    description: 'Dars turi',
  })
  @IsEnum(SessionType)
  @IsNotEmpty()
  sessionType: SessionType;

  @ApiPropertyOptional({
    example: 'Prisma ORM va Tranzaksiyalar bilan ishlash',
    description: 'Dars mavzusi',
  })
  @IsString()
  @IsOptional()
  topic?: string;

  @ApiProperty({ example: 'group-uuid-here', description: 'Guruh IDsi' })
  @IsUUID()
  @IsNotEmpty()
  groupId: string;

  @ApiProperty({ example: 'room-uuid-here', description: 'Xona IDsi' })
  @IsUUID()
  @IsNotEmpty()
  roomId: string;

  @ApiProperty({
    example: 'teacher-uuid-here',
    description: 'Dars o‘tuvchi o‘qituvchi IDsi',
  })
  @IsUUID()
  @IsNotEmpty()
  teacherId: string;

  @ApiPropertyOptional({
    example: 'subject-uuid-here',
    description:
      "Dars fani (maktab uchun; o'quv markaz uchun berilmasligi mumkin)",
  })
  @IsUUID()
  @IsOptional()
  subjectId?: string;
}

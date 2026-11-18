import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsUUID,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AttendanceStatus } from 'src/generated/prisma/enums';

export class AttendanceItemDto {
  @ApiProperty({ example: 'student-uuid-here', description: 'O‘quvchi IDsi' })
  @IsUUID()
  @IsNotEmpty()
  studentId: string;

  @ApiPropertyOptional({
    example: 'late',
    enum: AttendanceStatus,
    description:
      "Yo'qlama holati: present (keldi), late (kechikdi), excused (sababli), absent (sababsiz). Berilmasa isPresent dan aniqlanadi",
  })
  @IsOptional()
  @IsEnum(AttendanceStatus)
  status?: AttendanceStatus;

  @ApiPropertyOptional({
    example: true,
    description:
      "Eski format: true — present, false — absent. status berilsa ixtiyoriy (berilsa mos bo'lishi kerak)",
  })
  @ValidateIf((o: AttendanceItemDto) => o.status === undefined)
  @IsBoolean()
  isPresent?: boolean;

  @ApiProperty({ example: true, description: 'Uy vazifasini bajarganmi?' })
  @IsBoolean()
  homeworkDone: boolean;
}

export class BulkAttendanceDto {
  @ApiProperty({
    type: [AttendanceItemDto],
    description: 'Yo‘qlama qilinadigan o‘quvchilar ro‘yxati',
  })
  @IsArray()
  @ArrayMinSize(1, { message: 'Kamida 1 ta o‘quvchi bo‘lishi kerak' })
  @ArrayMaxSize(300, {
    message: 'Bir so‘rovda 300 tadan ortiq o‘quvchi bo‘lishi mumkin emas',
  })
  @ValidateNested({ each: true })
  @Type(() => AttendanceItemDto)
  records: AttendanceItemDto[];
}

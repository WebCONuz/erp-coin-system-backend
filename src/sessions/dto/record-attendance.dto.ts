import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class AttendanceItemDto {
  @ApiProperty({ example: 'student-uuid-here', description: 'O‘quvchi IDsi' })
  @IsUUID()
  @IsNotEmpty()
  studentId: string;

  @ApiProperty({
    example: true,
    description: 'Darsda qatnashyaptimi? (Bor/Yo‘q)',
  })
  @IsBoolean()
  isPresent: boolean;

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

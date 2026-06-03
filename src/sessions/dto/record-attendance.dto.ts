import { IsBoolean, IsNotEmpty, IsUUID } from 'class-validator';
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
  @IsNotEmpty()
  isPresent: boolean;

  @ApiProperty({ example: true, description: 'Uy vazifasini bajarganmi?' })
  @IsBoolean()
  @IsNotEmpty()
  homeworkDone: boolean;
}

export class BulkAttendanceDto {
  @ApiProperty({
    type: [AttendanceItemDto],
    description: 'Yo‘qlama qilinadigan o‘quvchilar ro‘yxati',
  })
  @IsNotEmpty()
  records: AttendanceItemDto[];
}

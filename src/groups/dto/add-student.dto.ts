import { IsUUID, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AddStudentDto {
  @ApiProperty({
    example: 'c2eebc99-9c0b-4ef8-bb6d-6bb9bd380a33',
    description: 'O‘quvchi (User) IDsi',
  })
  @IsUUID()
  @IsNotEmpty()
  studentId: string;
}

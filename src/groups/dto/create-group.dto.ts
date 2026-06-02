import {
  IsString,
  IsNotEmpty,
  IsInt,
  Min,
  Max,
  Length,
  IsUUID,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateGroupDto {
  @ApiProperty({ example: 'Node.js Backend - N1', description: 'Guruh nomi' })
  @IsString()
  @IsNotEmpty()
  @Length(2, 150)
  name: string;

  @ApiProperty({
    example: 20,
    description: 'Guruhdagi maksimal o‘quvchilar soni',
    default: 50,
  })
  @IsInt()
  @Min(1)
  @Max(100)
  maxStudents: number;

  @ApiProperty({
    example: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    description: 'Kurs IDsi (UUID)',
  })
  @IsUUID()
  @IsNotEmpty()
  courseId: string;

  @ApiProperty({
    example: 'b1eedc99-9c0b-4ef8-bb6d-6bb9bd380a22',
    description: 'O‘qituvchi (User) IDsi (UUID)',
  })
  @IsUUID()
  @IsNotEmpty()
  teacherId: string;
}

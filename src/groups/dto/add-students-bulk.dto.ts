import { IsUUID, IsArray, ArrayMinSize, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AddStudentsBulkDto {
  @ApiProperty({
    example: [
      'c2eebc99-9c0b-4ef8-bb6d-6bb9bd380a33',
      'd3eebc99-9c0b-4ef8-bb6d-6bb9bd380a44',
    ],
    description: 'O‘quvchilar (User) IDlari massivi',
    type: [String],
  })
  @IsArray()
  @IsNotEmpty()
  @IsUUID('4', { each: true }) // Massiv ichidagi har bir element UUID ekanligini tekshiradi
  @ArrayMinSize(1, { message: 'Kamida bitta o‘quvchi IDsi bo‘lishi kerak' })
  studentIds: string[];
}

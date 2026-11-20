import {
  IsUUID,
  IsArray,
  ArrayMinSize,
  ArrayMaxSize,
  ArrayUnique,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export const MAX_BULK_GROUP_STUDENTS = 300;

export class AddStudentsBulkDto {
  @ApiProperty({
    example: [
      'c2eebc99-9c0b-4ef8-bb6d-6bb9bd380a33',
      'd3eebc99-9c0b-4ef8-bb6d-6bb9bd380a44',
    ],
    description: `O‘quvchilar (User) IDlari massivi — shu tenantdagi faol studentlar, takrorsiz, ko'pi bilan ${MAX_BULK_GROUP_STUDENTS} ta`,
    type: [String],
  })
  @IsArray()
  @ArrayMinSize(1, { message: 'Kamida bitta o‘quvchi IDsi bo‘lishi kerak' })
  @ArrayMaxSize(MAX_BULK_GROUP_STUDENTS, {
    message: `Bir so‘rovda ${MAX_BULK_GROUP_STUDENTS} tadan ortiq o‘quvchi bo‘lishi mumkin emas`,
  })
  @ArrayUnique({ message: 'O‘quvchi IDlari takrorlanmasligi kerak' })
  @IsUUID('4', { each: true }) // Massiv ichidagi har bir element UUID ekanligini tekshiradi
  studentIds: string[];
}

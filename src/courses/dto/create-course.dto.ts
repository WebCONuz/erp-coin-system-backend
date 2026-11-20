import {
  IsString,
  IsNotEmpty,
  Length,
  IsOptional,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateCourseDto {
  @ApiProperty({
    example: 'Node.js Backend Course',
    description: 'kurs nomi',
  })
  @IsString()
  @IsNotEmpty()
  @Length(3, 150)
  title: string;

  @ApiPropertyOptional({
    example: 'Bu kurs Node.js asoslari va backend dasturlashni o‘rgatadi.',
    description: 'kurs tavsifi',
  })
  @IsString()
  @IsOptional()
  @MaxLength(1000)
  description?: string;
}

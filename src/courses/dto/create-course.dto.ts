import { IsString, IsNotEmpty, Length, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateCourseDto {
  @ApiProperty({
    example: 'Node.js Backend Course',
    description: 'kurs nomi',
  })
  @IsString()
  @IsNotEmpty()
  @Length(3, 150)
  title: string;

  @ApiProperty({
    example: 'Bu kurs Node.js asoslari va backend dasturlashni o‘rgatadi.',
    description: 'kurs tavsifi',
  })
  @IsString()
  @IsOptional()
  description: string;
}

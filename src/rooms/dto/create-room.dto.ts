import {
  IsString,
  IsNotEmpty,
  IsInt,
  Min,
  Max,
  IsOptional,
  Length,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateRoomDto {
  @ApiProperty({
    example: 'Room 101 (Coding Lab)',
    description: 'Xona nomi yoki raqami',
  })
  @IsString()
  @IsNotEmpty()
  @Length(2, 100)
  name: string;

  @ApiProperty({
    example: 20,
    description: 'Xonaning o‘quvchilar sig‘imi',
    default: 50,
  })
  @IsInt()
  @Min(1)
  @Max(300)
  capacity: number;

  @ApiPropertyOptional({
    example: '3-qavat, konditsioner va proyektor mavjud',
    description: 'Xona haqida qo‘shimcha ma’lumot',
  })
  @IsString()
  @IsOptional()
  description?: string;
}

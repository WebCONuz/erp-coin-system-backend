import {
  IsString,
  IsNotEmpty,
  Length,
  IsOptional,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateSubjectDto {
  @ApiProperty({
    example: 'Matematika',
    description: 'Fan nomi',
  })
  @IsString()
  @IsNotEmpty()
  @Length(2, 150)
  name: string;

  @ApiPropertyOptional({
    example: 'Algebra va geometriya asoslari',
    description: 'Fan tavsifi',
  })
  @IsString()
  @IsOptional()
  @MaxLength(1000)
  description?: string;
}

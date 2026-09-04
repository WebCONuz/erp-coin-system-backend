import { IsString, IsNotEmpty, Length, IsOptional } from 'class-validator';
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
  description?: string;
}

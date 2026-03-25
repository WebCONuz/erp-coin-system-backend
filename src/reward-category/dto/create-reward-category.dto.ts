import { IsString, IsNotEmpty, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateRewardCategoryDto {
  @ApiProperty({ example: 'Kitoblar' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;
}

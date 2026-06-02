import {
  IsString,
  IsNotEmpty,
  IsInt,
  Min,
  IsOptional,
  Length,
  IsEnum,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RewardType } from 'src/generated/prisma/enums';

export class CreateRewardDto {
  @ApiProperty({
    example: 'Akademiya Brend Futbolkasi',
    description: 'Sovg‘a nomi',
  })
  @IsString()
  @IsNotEmpty()
  @Length(2, 150)
  title: string;

  @ApiPropertyOptional({
    example: 'Paxtadan tikilgan, oversize formatda',
    description: 'Sovg‘a haqida',
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ example: 150, description: 'Sovg‘aning tangadagi narxi' })
  @IsInt()
  @Min(1, { message: 'Narx kamida 1 tanga bo‘lishi kerak' })
  coinPrice: number;

  @ApiProperty({
    example: 10,
    description: 'Omborda nechta mavjudligi (Zaxira)',
  })
  @IsInt()
  @Min(0, { message: 'Zaxira 0 dan kam bo‘lishi mumkin emas' })
  @IsOptional()
  stock?: number;

  @ApiProperty({
    example: 'category-uuid',
    description: 'Sovg‘a kategoriyasi IDsi',
  })
  @IsString()
  @IsNotEmpty()
  categoryId: string;

  @ApiPropertyOptional({
    example: 'https://example.com/image.jpg',
    description: 'Sovg‘a rasmi uchun URL',
  })
  @IsString()
  @IsOptional()
  imageUrl?: string;

  @ApiProperty({
    example: 'physical',
    description: 'Sovg‘a turi (privilege, physical yoki digital)',
  })
  @IsString()
  @IsEnum(['privilege', 'digital', 'physical'], {
    message: 'rewardType must be either PHYSICAL or DIGITAL',
  })
  @IsNotEmpty()
  rewardType: RewardType;
}

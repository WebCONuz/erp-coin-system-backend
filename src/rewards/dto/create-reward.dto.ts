import {
  IsString,
  IsNotEmpty,
  IsInt,
  Min,
  IsOptional,
  Length,
  IsEnum,
  IsUUID,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RewardType } from 'src/generated/prisma/enums';

// Rasm — o'zimiz yuklagan fayl (`/uploads/...`) yoki tashqi https manzil.
// `javascript:`, `data:`, `http:` kabi sxemalar rad etiladi
export const REWARD_IMAGE_URL_PATTERN =
  /^(\/uploads\/[A-Za-z0-9_-]+(\/[A-Za-z0-9._-]+)+|https:\/\/[^\s"'<>]+)$/;

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
  @MaxLength(1000)
  description?: string;

  @ApiProperty({ example: 150, description: 'Sovg‘aning tangadagi narxi' })
  @IsInt()
  @Min(1, { message: 'Narx kamida 1 tanga bo‘lishi kerak' })
  coinPrice: number;

  @ApiPropertyOptional({
    example: 10,
    description:
      'Yana nechta sotish mumkin (band qilingan xaridlar bunga kirmaydi). -1 — cheksiz. Berilmasa 0 (admin zaxirani kiritguncha sotilmaydi)',
  })
  @IsInt()
  @Min(-1, {
    message: 'Zaxira 0 yoki undan katta bo‘lishi kerak (-1 — cheksiz)',
  })
  @IsOptional()
  stock?: number;

  @ApiProperty({
    example: 'category-uuid',
    description: 'Sovg‘a kategoriyasi IDsi',
  })
  @IsUUID()
  @IsNotEmpty()
  categoryId: string;

  @ApiPropertyOptional({
    example: 'https://example.com/image.jpg',
    description: "Sovg‘a rasmi: '/uploads/...' yoki 'https://...'",
  })
  @IsOptional()
  // Bo'sh satr — rasmni olib tashlash (eski klientlar shunday yuboradi)
  @ValidateIf((_o, v) => v !== '')
  @IsString()
  @MaxLength(500)
  @Matches(REWARD_IMAGE_URL_PATTERN, {
    message: "imageUrl '/uploads/...' yoki 'https://...' bo'lishi kerak",
  })
  imageUrl?: string;

  @ApiProperty({
    example: 'physical',
    enum: RewardType,
    description: 'Sovg‘a turi (privilege, physical yoki digital)',
  })
  @IsEnum(RewardType, {
    message:
      'rewardType faqat privilege, physical yoki digital bo‘lishi mumkin',
  })
  rewardType: RewardType;
}

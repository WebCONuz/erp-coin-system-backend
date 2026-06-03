import {
  IsString,
  IsNotEmpty,
  IsInt,
  IsOptional,
  Length,
  IsEnum,
  IsUUID,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CoinDirection, TriggerType } from 'src/generated/prisma/enums';

export class CreateCoinRuleDto {
  @ApiProperty({
    example: 'Darsdagi faollik uchun',
    description: 'Tanga berish qoidasining qisqa nomi',
  })
  @IsString()
  @IsNotEmpty()
  @Length(3, 200)
  name: string;

  @ApiPropertyOptional({
    example:
      'Dars davomida topshiriqlarni birinchilardan bo‘lib bajargan talabalar uchun bonus tangalar',
    description: 'Qoida haqida batafsil izoh',
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({
    example: 10,
    description: 'Beriladigan yoki chegirib tashlanadigan tangalar miqdori',
  })
  @IsInt()
  @IsNotEmpty()
  coinAmount: number;

  @ApiProperty({
    example: 'earn',
    enum: CoinDirection,
    description:
      'Tangalar harakati yo‘nalishi: earn (tangani qo‘shish) yoki deduct (tangani ayirish)',
  })
  @IsEnum(CoinDirection, {
    message: 'direction faqat earn yoki deduct bo‘lishi mumkin',
  })
  @IsNotEmpty()
  direction: CoinDirection;

  @ApiProperty({
    example: 'manual',
    enum: TriggerType,
    description:
      'Ishga tushish turi: auto (avtomatik tizim tomonidan) yoki manual (o‘qituvchi tomonidan qo‘lda)',
  })
  @IsEnum(TriggerType, {
    message: 'triggerType faqat auto yoki manual bo‘lishi mumkin',
  })
  @IsNotEmpty()
  triggerType: TriggerType;

  @ApiPropertyOptional({
    example: 'group-uuid-here',
    description:
      'Agar qoida faqat ma’lum bir guruhga tegishli bo‘lsa, o‘sha guruh IDsi yuboriladi',
  })
  @IsOptional()
  @IsUUID()
  groupId?: string;
}

import {
  IsString,
  IsNotEmpty,
  IsInt,
  IsOptional,
  Length,
  IsEnum,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { MANUAL_COIN_HARD_MAX } from 'src/coin-transaction/constants/manual-coin';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  CoinDirection,
  SourceType,
  TriggerType,
} from 'src/generated/prisma/enums';

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
    example: 'Dars davomida faol ishtirok etgan talabalar uchun bonus',
    description: 'Qoida haqida batafsil izoh',
  })
  @IsString()
  @MaxLength(1000)
  @IsOptional()
  description?: string;

  @ApiProperty({
    example: 10,
    description: 'Beriladigan yoki chegirib tashlanadigan tangalar miqdori',
  })
  @IsInt()
  @Min(1, { message: "coinAmount kamida 1 bo'lishi kerak" })
  @Max(MANUAL_COIN_HARD_MAX, {
    message: `coinAmount ${MANUAL_COIN_HARD_MAX} dan oshmasligi kerak`,
  })
  @IsNotEmpty()
  coinAmount: number;

  @ApiProperty({
    example: 'earn',
    enum: CoinDirection,
    description: 'Tangalar harakati: earn (qoshish) yoki deduct (ayirish)',
  })
  @IsEnum(CoinDirection, {
    message: 'direction faqat earn yoki deduct bolishi mumkin',
  })
  @IsNotEmpty()
  direction: CoinDirection;

  @ApiProperty({
    example: 'manual',
    enum: TriggerType,
    description: 'Ishga tushish turi: auto (avtomatik) yoki manual (qolda)',
  })
  @IsEnum(TriggerType, {
    message: 'triggerType faqat auto yoki manual bolishi mumkin',
  })
  @IsNotEmpty()
  triggerType: TriggerType;

  @ApiPropertyOptional({
    example: 'attendance',
    enum: SourceType,
    description:
      'Auto qoidalar uchun trigger manbasi: attendance, homework, competition ...',
  })
  @IsOptional()
  @IsEnum(SourceType)
  sourceType?: SourceType;

  @ApiPropertyOptional({
    example: 'group-uuid-here',
    description:
      "Qoida faqat bitta guruhga tegishli bo'lsa, guruh IDsi (teacher uchun majburiy — faqat o'z guruhi)",
  })
  @IsOptional()
  @IsUUID()
  groupId?: string;
}

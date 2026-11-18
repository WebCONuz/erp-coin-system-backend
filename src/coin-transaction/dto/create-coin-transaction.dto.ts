import {
  IsString,
  IsNotEmpty,
  IsInt,
  IsOptional,
  IsEnum,
  IsUUID,
  IsIn,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CoinDirection, SourceType } from 'src/generated/prisma/enums';
import {
  COIN_NOTE_MAX_LENGTH,
  MANUAL_COIN_HARD_MAX,
  MANUAL_SOURCE_TYPES,
} from '../constants/manual-coin';

export class CreateCoinTransactionDto {
  @ApiProperty({
    example: 'student-uuid-here',
    description: 'Coin oluvchi talabaning IDsi',
  })
  @IsUUID()
  @IsNotEmpty()
  studentId: string;

  @ApiProperty({
    example: 15,
    description: 'Tranzaksiya qilinayotgan tanga miqdori',
  })
  @IsInt()
  @Min(1, { message: 'Tanga miqdori kamida 1 bo‘lishi kerak' })
  @Max(MANUAL_COIN_HARD_MAX, {
    message: `Tanga miqdori ${MANUAL_COIN_HARD_MAX} dan oshmasligi kerak`,
  })
  @IsNotEmpty()
  amount: number;

  @ApiProperty({
    example: 'earn',
    enum: CoinDirection,
    description: 'Yo‘nalish: earn (qo‘shish) yoki deduct (ayirish)',
  })
  @IsEnum(CoinDirection)
  @IsNotEmpty()
  direction: CoinDirection;

  @ApiProperty({
    example: 'bonus',
    enum: MANUAL_SOURCE_TYPES,
    description:
      "Tranzaksiya manbasi: faqat 'manual' yoki 'bonus' (davomat/imtihon coinlari sessiya orqali, xarid — xarid moduli orqali)",
  })
  @IsIn(MANUAL_SOURCE_TYPES, {
    message: "sourceType faqat 'manual' yoki 'bonus' bo'lishi mumkin",
  })
  sourceType: SourceType;

  @ApiPropertyOptional({
    example: 'Olimpiadada faol ishtirok etgani uchun',
    description: 'Izoh',
  })
  @IsString()
  @MaxLength(COIN_NOTE_MAX_LENGTH)
  @IsOptional()
  note?: string;

  @ApiPropertyOptional({
    example: 'rule-uuid-here',
    description: 'Agar biror qoidaga asoslangan bo‘lsa',
  })
  @IsUUID()
  @IsOptional()
  ruleId?: string;

  @ApiPropertyOptional({
    example: 'group-uuid-here',
    description: 'Guruh IDsi (ixtiyoriy)',
  })
  @IsUUID()
  @IsOptional()
  groupId?: string;

  @ApiPropertyOptional({
    example: 'session-uuid-here',
    description: 'Dars (Session) IDsi (ixtiyoriy)',
  })
  @IsUUID()
  @IsOptional()
  sessionId?: string;
}

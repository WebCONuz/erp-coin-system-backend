import {
  IsString,
  IsNotEmpty,
  IsInt,
  IsOptional,
  IsEnum,
  IsUUID,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CoinDirection, SourceType } from 'src/generated/prisma/enums';

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
    enum: SourceType,
    description:
      'Tranzaksiya manbasi (Manual operatsiyalar uchun asosan bonus yoki manual ishlatiladi)',
  })
  @IsEnum(SourceType)
  @IsNotEmpty()
  sourceType: SourceType;

  @ApiPropertyOptional({
    example: 'Olimpiadada faol ishtirok etgani uchun',
    description: 'Izoh',
  })
  @IsString()
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

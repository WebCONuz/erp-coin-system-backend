import {
  IsArray,
  ArrayMinSize,
  ArrayMaxSize,
  IsUUID,
  IsInt,
  IsOptional,
  IsEnum,
  IsString,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CoinDirection, SourceType } from 'src/generated/prisma/enums';

export class BulkGiveCoinDto {
  @ApiProperty({
    type: [String],
    example: ['student-uuid-1', 'student-uuid-2'],
    description: 'Coin oluvchi o‘quvchilarning IDlari (kamida 1 ta)',
  })
  @IsArray()
  @ArrayMinSize(1, { message: 'Kamida 1 ta o‘quvchi tanlanishi kerak' })
  @ArrayMaxSize(300, {
    message: 'Bir so‘rovda 300 tadan ortiq o‘quvchi bo‘lishi mumkin emas',
  })
  @IsUUID('4', { each: true })
  studentIds: string[];

  @ApiProperty({
    example: 5,
    description:
      'Har bir o‘quvchiga beriladigan/ayiriladigan bir xil tanga miqdori',
  })
  @IsInt()
  @Min(1, { message: 'Tanga miqdori kamida 1 bo‘lishi kerak' })
  amount: number;

  @ApiProperty({
    example: 'earn',
    enum: CoinDirection,
    description: 'Yo‘nalish: earn (qo‘shish) yoki deduct (ayirish)',
  })
  @IsEnum(CoinDirection)
  direction: CoinDirection;

  @ApiProperty({
    example: 'bonus',
    enum: SourceType,
    description: 'Tranzaksiya manbasi',
  })
  @IsEnum(SourceType)
  sourceType: SourceType;

  @ApiPropertyOptional({
    example: 'Darsda faol qatnashgani uchun',
    description: 'Barcha tanlangan o‘quvchilar uchun bir xil izoh',
  })
  @IsOptional()
  @IsString()
  note?: string;

  @ApiPropertyOptional({
    description: 'Guruh IDsi (ixtiyoriy, statistika uchun)',
  })
  @IsOptional()
  @IsUUID()
  groupId?: string;

  @ApiPropertyOptional({ description: 'Dars (Session) IDsi (ixtiyoriy)' })
  @IsOptional()
  @IsUUID()
  sessionId?: string;
}

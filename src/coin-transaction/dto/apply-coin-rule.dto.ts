import {
  IsArray,
  ArrayMinSize,
  ArrayMaxSize,
  IsUUID,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ApplyCoinRuleDto {
  @ApiProperty({
    example: 'rule-uuid-here',
    description: 'Qo‘llanadigan CoinRule IDsi',
  })
  @IsUUID()
  @IsNotEmpty()
  ruleId: string;

  @ApiProperty({
    type: [String],
    example: ['student-uuid-1', 'student-uuid-2'],
    description: 'Qoida qo‘llanadigan o‘quvchilarning IDlari (kamida 1 ta)',
  })
  @IsArray()
  @ArrayMinSize(1, { message: 'Kamida 1 ta o‘quvchi tanlanishi kerak' })
  @ArrayMaxSize(300, {
    message: 'Bir so‘rovda 300 tadan ortiq o‘quvchi bo‘lishi mumkin emas',
  })
  @IsUUID('4', { each: true })
  studentIds: string[];

  @ApiPropertyOptional({
    example: 'Oy yakuni bonusi',
    description:
      'Izoh (berilmasa avtomatik "<qoida nomi>" qoidasi asosida" matni ishlatiladi)',
  })
  @IsOptional()
  @IsString()
  note?: string;

  @ApiPropertyOptional({ description: 'Dars (Session) IDsi (ixtiyoriy)' })
  @IsOptional()
  @IsUUID()
  sessionId?: string;
}

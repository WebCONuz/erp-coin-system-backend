import {
  IsOptional,
  IsNumber,
  Min,
  IsString,
  IsUUID,
  IsEnum,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { TriggerType, CoinDirection } from 'src/generated/prisma/enums';

export class QueryCoinRuleDto {
  @ApiPropertyOptional({ description: 'Faqat super_admin va creator uchun' })
  @IsOptional()
  @IsUUID()
  tenantId?: string;

  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ example: 10, default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  limit?: number = 10;

  @ApiPropertyOptional({
    example: 'Darsdagi',
    description: 'Nomi bo‘yicha filtr',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    enum: TriggerType,
    description: 'Ishga tushish turi bo‘yicha filtr',
  })
  @IsOptional()
  @IsEnum(TriggerType)
  triggerType?: TriggerType;

  @ApiPropertyOptional({
    enum: CoinDirection,
    description: 'Yo‘nalish bo‘yicha filtr',
  })
  @IsOptional()
  @IsEnum(CoinDirection)
  direction?: CoinDirection;

  @ApiPropertyOptional({ description: 'Guruh IDsi bo‘yicha filtr' })
  @IsOptional()
  @IsUUID()
  groupId?: string;
}

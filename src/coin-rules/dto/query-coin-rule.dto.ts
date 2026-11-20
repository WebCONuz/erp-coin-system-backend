import {
  IsOptional,
  IsString,
  IsUUID,
  IsEnum,
  IsBoolean,
  MaxLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { TriggerType, CoinDirection } from 'src/generated/prisma/enums';
import { PaginationQueryDto } from 'src/common/dto/pagination-query.dto';

export class QueryCoinRuleDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    example: 'Darsdagi',
    description: 'Nomi bo‘yicha filtr',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
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

  @ApiPropertyOptional({
    description: 'Nofaol qoidalarni ham ko‘rish uchun',
    example: true,
  })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  isActive?: boolean;
}

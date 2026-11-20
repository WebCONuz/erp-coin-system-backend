import { IsOptional, IsUUID, IsEnum } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { CoinDirection, SourceType } from 'src/generated/prisma/enums';
import { PaginationQueryDto } from 'src/common/dto/pagination-query.dto';

export class QueryCoinTransactionDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Aniq bir talabaning tranzaksiyalarini ko‘rish uchun',
  })
  @IsOptional()
  @IsUUID()
  studentId?: string;

  @ApiPropertyOptional({
    description: 'Tranzaksiyani amalga oshirgan o‘qituvchi bo‘yicha filtr',
  })
  @IsOptional()
  @IsUUID()
  teacherId?: string;

  @ApiPropertyOptional({ enum: CoinDirection })
  @IsOptional()
  @IsEnum(CoinDirection)
  direction?: CoinDirection;

  @ApiPropertyOptional({ enum: SourceType })
  @IsOptional()
  @IsEnum(SourceType)
  sourceType?: SourceType;
}

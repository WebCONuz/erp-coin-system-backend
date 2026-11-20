import { IsOptional, IsUUID, IsEnum } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PurchaseStatus } from 'src/generated/prisma/enums';
import { PaginationQueryDto } from 'src/common/dto/pagination-query.dto';

export class QueryPurchaseDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Aniq bir talabaning xaridlarini ko‘rish',
  })
  @IsOptional()
  @IsUUID()
  studentId?: string;

  @ApiPropertyOptional({
    description: 'Aniq bir sovg‘a bo‘yicha xaridlarni ko‘rish',
  })
  @IsOptional()
  @IsUUID()
  rewardId?: string;

  @ApiPropertyOptional({
    enum: PurchaseStatus,
    description: 'Holat bo‘yicha filtr',
  })
  @IsOptional()
  @IsEnum(PurchaseStatus)
  status?: PurchaseStatus;
}

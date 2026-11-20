import {
  IsOptional,
  IsString,
  IsUUID,
  IsBoolean,
  MaxLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationQueryDto } from 'src/common/dto/pagination-query.dto';

export class QueryRewardDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    example: 'Futbolka',
    description: 'Nomi bo‘yicha qidiruv',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({
    example: '47d40fef-5308-4c08-89f3-57a91e5d76aa',
    description: "Kategoriya bo'yicha filter",
  })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({
    description: 'Faqat omborda borlarini ko‘rish uchun',
    example: true,
  })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  onlyInStock?: boolean;

  @ApiPropertyOptional({
    description: "Aktive yoki Inactive sovg'alar",
    example: true,
  })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  isActive?: boolean;
}

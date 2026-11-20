import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { TenantQueryDto } from './tenant-query.dto';

// Bitta so'rovda qaytariladigan yozuvlar soni chegarasi — `?limit=1000000` bilan
// butun jadvalni xotiraga yuklashning oldini oladi
export const MAX_PAGE_LIMIT = 100;

/**
 * Ro'yxat (pagination) endpointlarining query DTO'lari uchun asos: `tenantId` (TenantQueryDto),
 * `page`, `limit` (1–100). Standart qiymatlar har bir servisda (`limit = 10` / `20`) — bu yerda
 * initializer yo'q, shuning uchun mavjud endpointlarning default'i o'zgarmaydi.
 */
export class PaginationQueryDto extends TenantQueryDto {
  @ApiPropertyOptional({
    example: 1,
    minimum: 1,
    description: 'Sahifa (1 dan)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({
    example: 10,
    minimum: 1,
    maximum: MAX_PAGE_LIMIT,
    description: `Sahifadagi yozuvlar soni (ko'pi bilan ${MAX_PAGE_LIMIT})`,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_LIMIT)
  limit?: number;
}

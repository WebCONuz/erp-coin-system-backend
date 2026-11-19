import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

/**
 * `@TenantContext()` ishlatadigan GET endpointlarning query DTO'lari uchun asos.
 * super_admin/creator `?tenantId=` yuborishi **majburiy**; global ValidationPipe
 * (`forbidNonWhitelisted: true`) DTO'da yo'q maydonni rad etadi — shuning uchun har bir
 * `@Query()` DTO'sida `tenantId` bo'lishi shart, aks holda super_admin so'rovi doim 400 oladi.
 * Qiymatni `@TenantContext()` o'qiydi; servis uni query'dan olmaydi.
 */
export class TenantQueryDto {
  @ApiPropertyOptional({ description: 'Faqat super_admin va creator uchun' })
  @IsOptional()
  @IsUUID()
  tenantId?: string;
}

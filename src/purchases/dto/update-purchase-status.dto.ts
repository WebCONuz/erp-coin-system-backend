import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PurchaseStatus } from 'src/generated/prisma/enums';

// Admin o'rnata oladigan statuslar. `pending` — faqat xarid yaratilganda.
export const ADMIN_SETTABLE_PURCHASE_STATUSES = [
  PurchaseStatus.approved,
  PurchaseStatus.delivered,
  PurchaseStatus.cancelled,
] as const;

export type AdminSettablePurchaseStatus =
  (typeof ADMIN_SETTABLE_PURCHASE_STATUSES)[number];

export class UpdatePurchaseStatusDto {
  @ApiProperty({
    example: 'approved',
    enum: ADMIN_SETTABLE_PURCHASE_STATUSES,
    description:
      'approved — tasdiqlash (sovg‘a tayyor), delivered — qo‘lga berildi, cancelled — bekor qilish (coin qaytadi)',
  })
  @IsIn(ADMIN_SETTABLE_PURCHASE_STATUSES, {
    message: 'Status faqat approved, delivered yoki cancelled bo‘lishi mumkin',
  })
  @IsNotEmpty()
  status: AdminSettablePurchaseStatus;

  @ApiPropertyOptional({
    example: 'Ushbu sovg‘a vaqtincha tugab qolgani sababli xarid bekor qilindi',
    description:
      'Admin izohi. Berilsa, xaridning `deliveryNote` maydoniga yoziladi',
  })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  adminNote?: string;
}

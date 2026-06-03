import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PurchaseStatus } from 'src/generated/prisma/enums';

export class UpdatePurchaseStatusDto {
  @ApiProperty({
    example: 'approved',
    enum: PurchaseStatus,
    description:
      'Xarid holati: approved (tasdiqlash/topshirish) yoki rejected (rad etish)',
  })
  @IsEnum(PurchaseStatus, {
    message: 'Status faqat approved yoki rejected bo‘lishi mumkin',
  })
  @IsNotEmpty()
  status: PurchaseStatus;

  @ApiPropertyOptional({
    example: 'Ushbu sovg‘a vaqtincha tugab qolgani sababli xarid rad etildi',
    description: 'Xarid rad etilganda yoki tasdiqlanganda yoziladigan izoh',
  })
  @IsString()
  @IsOptional()
  adminNote?: string;
}

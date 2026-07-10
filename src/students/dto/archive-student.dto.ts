import { IsBoolean, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class ArchiveStudentDto {
  @ApiPropertyOptional({
    description:
      "false — arxivlash (to'lov qilmagan, vaqtinchalik to'xtatilgan); true — arxivdan qaytarish",
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    description:
      "true — soft delete (o'qishni tugatgan / noto'g'ri qo'shilgan); false — tiklash (faqat super_admin)",
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  isDeleted?: boolean;
}

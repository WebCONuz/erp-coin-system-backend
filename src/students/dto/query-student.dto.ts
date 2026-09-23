import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export enum StudentSortBy {
  fullName = 'fullName',
  coin = 'coin',
  createdAt = 'createdAt',
}

export enum SortOrder {
  asc = 'asc',
  desc = 'desc',
}

export class QueryStudentDto {
  @ApiPropertyOptional({ description: 'Faqat super_admin uchun' })
  @IsOptional()
  @IsUUID()
  tenantId?: string;

  @ApiPropertyOptional({ description: "Ism yoki telefon bo'yicha qidirish" })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: "Guruh ID bo'yicha filtr" })
  @IsOptional()
  @IsUUID()
  groupId?: string;

  @ApiPropertyOptional({
    description:
      "true — faqat faollar, false — faqat arxivlanganlar, bo'sh — ikkalasi (o'chirilmaganlar)",
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return undefined;
  })
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({
    enum: StudentSortBy,
    default: StudentSortBy.createdAt,
    description:
      "Saralash maydoni: fullName (ism-sharif alifbo bo'yicha), coin (wallet balansi bo'yicha), createdAt (qo'shilgan sana bo'yicha)",
  })
  @IsOptional()
  @IsEnum(StudentSortBy)
  sortBy?: StudentSortBy = StudentSortBy.createdAt;

  @ApiPropertyOptional({
    enum: SortOrder,
    default: SortOrder.desc,
    description: 'asc — o‘sish tartibida, desc — kamayish tartibida',
  })
  @IsOptional()
  @IsEnum(SortOrder)
  sortOrder?: SortOrder = SortOrder.desc;
}

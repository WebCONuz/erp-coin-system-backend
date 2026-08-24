import {
  IsOptional,
  IsString,
  IsUUID,
  IsEnum,
  IsInt,
  IsBoolean,
  Min,
  Max,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export enum UserSortBy {
  createdAt = 'createdAt',
  fullName = 'fullName',
}

export class QueryUserDto {
  @ApiPropertyOptional({ description: 'Faqat super_admin uchun' })
  @IsOptional()
  @IsUUID()
  tenantId?: string; // faqat super_admin uchun

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string; // fullName yoki phone bo'yicha qidirish

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  roleId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  groupId?: string; // teacher o'z guruhidagi studentlarni ko'rishi uchun

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

  @ApiPropertyOptional({ enum: UserSortBy, default: UserSortBy.createdAt })
  @IsOptional()
  @IsEnum(UserSortBy)
  sortBy?: UserSortBy = UserSortBy.createdAt;

  @ApiPropertyOptional({
    description: "Rol nomi bo'yicha filtr (masalan: student, teacher, admin)",
  })
  @IsOptional()
  @IsString()
  roleName?: string;

  @ApiPropertyOptional({ description: 'true = faol, false = arxivlangan' })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  isActive?: boolean;
}

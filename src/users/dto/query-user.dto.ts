import {
  IsOptional,
  IsString,
  IsUUID,
  IsEnum,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export enum UserSortBy {
  createdAt = 'createdAt',
  fullName = 'fullName',
}

export class QueryUserDto {
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
}

import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsEnum,
  IsBoolean,
  IsString,
  IsUUID,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { RoleScope } from 'src/generated/prisma/enums';

export class QueryRoleDto {
  @ApiPropertyOptional({ description: 'Faqat super_admin uchun' })
  @IsOptional()
  @IsUUID()
  tenantId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: RoleScope })
  @IsOptional()
  @IsEnum(RoleScope)
  scope?: RoleScope;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => value === 'true')
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Transform(({ value }) => parseInt(value))
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Transform(({ value }) => parseInt(value))
  limit?: number = 20;
}

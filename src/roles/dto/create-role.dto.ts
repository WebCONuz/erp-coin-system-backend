import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  MaxLength,
  Min,
  Max,
} from 'class-validator';
import { RoleScope } from 'src/generated/prisma/enums';

export class CreateRoleDto {
  @ApiProperty({ example: 'teacher' })
  @IsString()
  @MaxLength(50)
  name: string;

  @ApiProperty({ example: 'Teacher' })
  @IsString()
  @MaxLength(100)
  displayName: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  level?: number;

  @ApiPropertyOptional({ enum: RoleScope, default: RoleScope.tenant })
  @IsOptional()
  @IsEnum(RoleScope)
  scope?: RoleScope;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  canDelete?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  canManageAdmins?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  canManageUsers?: boolean;
}

import { PartialType, OmitType, ApiProperty } from '@nestjs/swagger';
import { CreateUserDto } from './create-user.dto';
import { IsOptional, IsString, MinLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateUserDto extends PartialType(
  // password va roleId ni PartialType dan chiqaramiz — ular alohida endpoint orqali o'zgartiriladi
  OmitType(CreateUserDto, ['password', 'roleId'] as const),
) {}

export class ChangePasswordDto {
  @ApiPropertyOptional()
  @IsOptional() // admin o'zgartirsa old parol shart emas
  @IsString()
  oldPassword?: string;

  @ApiProperty()
  @IsString()
  @MinLength(6)
  newPassword: string;
}

import { PartialType, OmitType, ApiProperty } from '@nestjs/swagger';
import { CreateUserDto } from './create-user.dto';
import { IsOptional, IsString, IsEmail, MinLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateUserDto extends PartialType(
  OmitType(CreateUserDto, ['password'] as const),
) {}

// Foydalanuvchi (teacher, admin va h.k.) o'zini o'zi tahrirlashi uchun —
// roleId, tenantId, phone kabi xavfli maydonlar bu yerda yo'q
export class UpdateOwnProfileDto {
  @ApiPropertyOptional({ example: 'ali@gmail.com' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: '/uploads/avatars/photo.jpg' })
  @IsOptional()
  @IsString()
  avatarUrl?: string;
}

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

import { PartialType, OmitType, ApiProperty } from '@nestjs/swagger';
import { CreateUserDto } from './create-user.dto';
import {
  IsOptional,
  IsString,
  IsEmail,
  MinLength,
  Matches,
  IsNotEmpty,
  MaxLength,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsUsername } from './username.decorator';
import { IsAvatarUrl } from './avatar-url.decorator';

export class UpdateUserDto extends PartialType(
  OmitType(CreateUserDto, ['password'] as const),
) {}

// Har qanday rol (student, teacher, admin, super_admin, creator) o'zini o'zi tahrirlashi uchun —
// roleId, tenantId, parol kabi maydonlar bu yerda yo'q
export class UpdateOwnProfileDto {
  @ApiPropertyOptional({ example: 'ali_valiyev' })
  @IsOptional()
  @IsUsername()
  username?: string;

  @ApiPropertyOptional({ example: 'Ali Valiyev' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  fullName?: string;

  @ApiPropertyOptional({ example: '+998901234567' })
  @IsOptional()
  @IsString()
  @Matches(/^\+998[0-9]{9}$/, {
    message: 'Telefon raqam formati: +998XXXXXXXXX',
  })
  phone?: string;

  @ApiPropertyOptional({ example: '+998901234567' })
  @IsOptional()
  @IsString()
  @Matches(/^\+998[0-9]{9}$/, {
    message: 'Telefon raqam formati: +998XXXXXXXXX',
  })
  parentPhone?: string;

  @ApiPropertyOptional({ example: 'ali@gmail.com' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({
    example: '/uploads/avatars/3f2c1a9e-....png',
    description: "Yuklangan fayl yo'li yoki https URL",
  })
  @IsOptional()
  @IsAvatarUrl()
  avatarUrl?: string;
}

export class ChangePasswordDto {
  @ApiPropertyOptional({
    description:
      "O'z parolini o'zgartirishda majburiy; admin boshqa userning parolini o'zgartirsa — shart emas",
  })
  @IsOptional()
  @IsString()
  oldPassword?: string;

  @ApiProperty()
  @IsString()
  @MinLength(6)
  newPassword: string;
}

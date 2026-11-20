import {
  IsString,
  IsOptional,
  IsEmail,
  IsUUID,
  IsNotEmpty,
  Matches,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsUsername } from './username.decorator';
import { IsNewPassword } from './password.decorator';
import { IsAvatarUrl } from './avatar-url.decorator';

export class CreateUserDto {
  @ApiProperty({
    example: 'ali_valiyev',
    description:
      "Login uchun, butun tizimda unique. 3–30 belgi: a-z, 0-9, '_', '.' (kichik harfga keltiriladi)",
  })
  @IsUsername()
  username: string;

  @ApiProperty({
    example: '+998901234567',
    description: 'Tenant ichida unique',
  })
  @IsString()
  @Matches(/^\+998[0-9]{9}$/, {
    message: 'Telefon raqam formati: +998XXXXXXXXX',
  })
  phone: string;

  @ApiProperty({ example: 'Ali Valiyev', maxLength: 150 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  fullName: string;

  @ApiProperty({ example: 'Parol123!', minLength: 8, maxLength: 72 })
  @IsNewPassword()
  password: string;

  @ApiProperty({ example: 'uuid-of-role' })
  @IsUUID()
  roleId: string;

  @ApiPropertyOptional({ example: 'ali@gmail.com' })
  @IsOptional()
  @IsEmail()
  @MaxLength(150)
  email?: string;

  @ApiPropertyOptional({ example: '+998901234567' })
  @IsOptional()
  @IsString()
  @Matches(/^\+998[0-9]{9}$/, {
    message: 'Telefon raqam formati: +998XXXXXXXXX',
  })
  parentPhone?: string;

  @ApiPropertyOptional({
    example: '/uploads/avatars/3f2c1a9e-....png',
    description: "Yuklangan fayl yo'li yoki https URL",
  })
  @IsOptional()
  @IsAvatarUrl()
  avatarUrl?: string;
}

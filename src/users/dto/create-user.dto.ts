import {
  IsString,
  IsEnum,
  IsOptional,
  IsEmail,
  IsUUID,
  MinLength,
  Matches,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateUserDto {
  @ApiProperty({ example: '+998901234567' })
  @IsString()
  @Matches(/^\+998[0-9]{9}$/, {
    message: 'Telefon raqam formati: +998XXXXXXXXX',
  })
  phone: string;

  @ApiProperty({ example: 'Ali Valiyev' })
  @IsString()
  fullName: string;

  @ApiProperty({ example: 'Parol123!' })
  @IsString()
  @MinLength(6)
  password: string;

  @ApiProperty({ example: 'uuid-of-role' })
  @IsUUID()
  roleId: string;

  @ApiPropertyOptional({ example: 'ali@gmail.com' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: '+998901234567' })
  @IsOptional()
  @IsString()
  @Matches(/^\+998[0-9]{9}$/, {
    message: 'Telefon raqam formati: +998XXXXXXXXX',
  })
  parentPhone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  avatarUrl?: string;
}

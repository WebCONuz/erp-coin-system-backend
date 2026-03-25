import { IsString, Matches, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ example: '+998901234567' })
  @IsString()
  @Matches(/^\+998[0-9]{9}$/, {
    message: 'Telefon raqam formati: +998XXXXXXXXX',
  })
  phone: string;

  @ApiProperty({ example: 'Parol123!' })
  @IsString()
  @MinLength(6)
  password: string;
}

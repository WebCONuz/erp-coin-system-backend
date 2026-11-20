import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { IsUsername } from 'src/users/dto/username.decorator';

export class LoginDto {
  @ApiProperty({ example: 'ali_valiyev' })
  @IsUsername()
  username: string;

  // Login'da uzunlik siyosati qo'llanmaydi — eski (qisqa) parollar ham kira olishi kerak.
  // Yuqori chegara faqat juda katta qiymat bilan bcrypt'ni yuklashning oldini oladi
  @ApiProperty({ example: 'Parol123!' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(1024)
  password: string;
}

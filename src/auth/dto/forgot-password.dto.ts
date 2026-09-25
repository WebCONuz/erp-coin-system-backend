import { ApiProperty } from '@nestjs/swagger';
import { IsUsername } from 'src/users/dto/username.decorator';

export class ForgotPasswordDto {
  // Email endi unique emas — user username bo'yicha topiladi, xat uning emailiga yuboriladi
  @ApiProperty({ example: 'ali_valiyev' })
  @IsUsername()
  username: string;
}

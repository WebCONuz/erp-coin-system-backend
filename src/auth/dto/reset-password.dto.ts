import { IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { IsNewPassword } from 'src/users/dto/password.decorator';
import { PASSWORD_MIN_LENGTH } from 'src/users/constants/password';

export class ResetPasswordDto {
  @ApiProperty({ description: 'Emaildagi havoladan olingan token' })
  @IsString()
  @MaxLength(128)
  token: string;

  @ApiProperty({ minLength: PASSWORD_MIN_LENGTH, maxLength: 72 })
  @IsNewPassword()
  newPassword: string;
}

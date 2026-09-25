import { IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { IsUsername } from 'src/users/dto/username.decorator';

export class LoginDto {
  @ApiProperty({ example: 'ali_valiyev' })
  @IsUsername()
  username: string;

  @ApiProperty({ example: 'Parol123!' })
  @IsString()
  @MinLength(6)
  password: string;
}

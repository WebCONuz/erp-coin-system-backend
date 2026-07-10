import {
  IsArray,
  IsEmail,
  IsEnum,
  IsString,
  Matches,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum MessageChannel {
  sms = 'sms',
  email = 'email',
}

export class SendMessageDto {
  @ApiPropertyOptional({
    example: '+998901234567',
    description: 'channels da "sms" bo\'lsa majburiy',
  })
  @ValidateIf((o: SendMessageDto) => o.channels?.includes(MessageChannel.sms))
  @IsString()
  @Matches(/^\+998[0-9]{9}$/, { message: 'Telefon formati: +998XXXXXXXXX' })
  recipientPhone?: string;

  @ApiPropertyOptional({
    example: 'user@example.com',
    description: 'channels da "email" bo\'lsa majburiy',
  })
  @ValidateIf((o: SendMessageDto) => o.channels?.includes(MessageChannel.email))
  @IsEmail({}, { message: "Email manzil noto'g'ri" })
  recipientEmail?: string;

  @ApiProperty({ example: 'Siz uchun muhim xabar!' })
  @IsString()
  @MinLength(1)
  message: string;

  @ApiProperty({
    enum: MessageChannel,
    isArray: true,
    example: ['sms', 'email'],
    description: 'Yuborish kanallari: sms, email',
  })
  @IsArray()
  @IsEnum(MessageChannel, { each: true })
  channels: MessageChannel[];
}

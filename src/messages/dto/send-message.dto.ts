import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum MessageChannel {
  sms = 'sms',
  email = 'email',
}

export const MESSAGE_MAX_LENGTH = 2000;
export const EMAIL_SUBJECT_MAX_LENGTH = 200;

// Qabul qiluvchi ixtiyoriy telefon/email bo'lishi mumkin (ota-ona, o'quv markaz lidlari).
// Har bir yuborish SmsLog/EmailLog ga yoziladi.
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
  @MaxLength(150)
  recipientEmail?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      "Qabul qiluvchi shu tenant useri bo'lsa (masalan o'quvchi yoki uning ota-onasi uchun — o'quvchi IDsi). Logda bog'lanadi. Ixtiyoriy",
  })
  @IsOptional()
  @IsUUID()
  userId?: string;

  @ApiPropertyOptional({
    example: 'Dars jadvali o‘zgardi',
    maxLength: EMAIL_SUBJECT_MAX_LENGTH,
    description:
      'Email mavzusi (ixtiyoriy). Berilmasa — "CoinLearn — <yuboruvchi> dan xabar"',
  })
  @IsOptional()
  @IsString()
  @MaxLength(EMAIL_SUBJECT_MAX_LENGTH)
  subject?: string;

  @ApiProperty({
    example: 'Siz uchun muhim xabar!',
    maxLength: MESSAGE_MAX_LENGTH,
    description: 'Oddiy matn (HTML sifatida talqin qilinmaydi)',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(MESSAGE_MAX_LENGTH)
  message: string;

  @ApiProperty({
    enum: MessageChannel,
    isArray: true,
    example: ['sms', 'email'],
    description: 'Yuborish kanallari: sms, email',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsEnum(MessageChannel, { each: true })
  channels: MessageChannel[];
}

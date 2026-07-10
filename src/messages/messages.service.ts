import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { MailService } from 'src/mail/mail.service';
import { SendMessageDto, MessageChannel } from './dto/send-message.dto';

@Injectable()
export class MessagesService {
  private readonly logger = new Logger(MessagesService.name);
  private eskizToken: string | null = null;
  private eskizTokenExpiry: number = 0;

  constructor(
    private readonly config: ConfigService,
    private readonly mail: MailService,
  ) {}

  async send(dto: SendMessageDto, senderFullName: string) {
    const results: { channel: string; success: boolean; error?: string }[] = [];

    for (const channel of dto.channels) {
      if (channel === MessageChannel.sms) {
        if (!dto.recipientPhone) {
          throw new BadRequestException('SMS uchun recipientPhone majburiy');
        }
        const result = await this.sendSms(dto.recipientPhone, dto.message);
        results.push(result);
      }

      if (channel === MessageChannel.email) {
        if (!dto.recipientEmail) {
          throw new BadRequestException('Email uchun recipientEmail majburiy');
        }
        const result = await this.sendEmail(
          dto.recipientEmail,
          dto.message,
          senderFullName,
        );
        results.push(result);
      }
    }

    const allSuccess = results.every((r) => r.success);
    return {
      message: allSuccess
        ? 'Xabar muvaffaqiyatli yuborildi'
        : 'Xabar qisman yuborildi',
      results,
    };
  }

  // ─── SMS — Eskiz.uz ────────────────────────────────────────────
  private async sendSms(
    phone: string,
    message: string,
  ): Promise<{ channel: string; success: boolean; error?: string }> {
    try {
      const token = await this.getEskizToken();
      const sender = this.config.get<string>('ESKIZ_SENDER') ?? '4546';

      // Telefon raqamni xalqaro formatdan mahalliy formatga o'tkazish (+998 → 998...)
      const mobile = phone.replace(/^\+/, '');

      await axios.post(
        'https://notify.eskiz.uz/api/message/sms/send',
        { mobile_phone: mobile, message, from: sender },
        { headers: { Authorization: `Bearer ${token}` } },
      );

      return { channel: 'sms', success: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'SMS yuborishda xatolik';
      this.logger.error(`SMS xatolik [${phone}]: ${msg}`);
      return { channel: 'sms', success: false, error: msg };
    }
  }

  // ─── Email ────────────────────────────────────────────────────
  private async sendEmail(
    to: string,
    message: string,
    senderName: string,
  ): Promise<{ channel: string; success: boolean; error?: string }> {
    try {
      await this.mail.sendCustomMessage({ to, message, senderName });
      return { channel: 'email', success: true };
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Email yuborishda xatolik';
      this.logger.error(`Email xatolik [${to}]: ${msg}`);
      return { channel: 'email', success: false, error: msg };
    }
  }

  // ─── Eskiz token olish (cache bilan) ─────────────────────────
  private async getEskizToken(): Promise<string> {
    // Token 29 daqiqa (1740 soniya) tugamagan bo'lsa — qaytadan so'ramaymiz
    if (this.eskizToken && Date.now() < this.eskizTokenExpiry) {
      return this.eskizToken;
    }

    const email = this.config.get<string>('ESKIZ_EMAIL');
    const password = this.config.get<string>('ESKIZ_PASSWORD');

    if (!email || !password) {
      throw new Error('ESKIZ_EMAIL yoki ESKIZ_PASSWORD .env da topilmadi');
    }

    const res = await axios.post<{ data: { token: string } }>(
      'https://notify.eskiz.uz/api/auth/login',
      { email, password },
    );

    this.eskizToken = res.data.data.token;
    this.eskizTokenExpiry = Date.now() + 29 * 60 * 1000;

    return this.eskizToken;
  }
}

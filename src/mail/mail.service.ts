import { Injectable } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { ConfigService } from '@nestjs/config';
import {
  escapeHtml,
  escapeHtmlMultiline,
  toSingleLine,
} from 'src/common/utils/html-escape';

// Xat yuborish uzoq osilib qolmasligi uchun (SMTP javob bermasa)
const SMTP_TIMEOUT_MS = 15_000;

@Injectable()
export class MailService {
  private readonly transporter: nodemailer.Transporter;
  private readonly frontendUrl: string;

  constructor(config: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host: config.get<string>('SMTP_HOST'),
      port: config.get<number>('SMTP_PORT'),
      auth: {
        user: config.get<string>('SMTP_USER'),
        pass: config.get<string>('SMTP_PASSWORD'),
      },
      connectionTimeout: SMTP_TIMEOUT_MS,
      greetingTimeout: SMTP_TIMEOUT_MS,
      socketTimeout: SMTP_TIMEOUT_MS,
    });
    this.frontendUrl = config.get<string>('FRONTEND_DOMEN') ?? '';
  }

  // Foydalanuvchi kiritgan barcha matnlar (xabar, ism) HTML'ga escape qilinib qo'yiladi —
  // aks holda xatga havola/forma joylab, tashkilot nomidan phishing yuborish mumkin edi
  async sendCustomMessage(params: {
    to: string;
    subject: string;
    message: string;
    senderName: string;
  }) {
    await this.transporter.sendMail({
      to: params.to,
      subject: toSingleLine(params.subject),
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: auto;">
          <h3>Yangi xabar</h3>
          <p>${escapeHtmlMultiline(params.message)}</p>
          <p style="color:#888;font-size:13px;margin-top:16px;">
            Yuboruvchi: <b>${escapeHtml(params.senderName)}</b>
          </p>
        </div>
      `,
    });
  }

  async sendPasswordReset(params: {
    to: string;
    fullName: string;
    token: string;
  }) {
    const resetLink = `${this.frontendUrl}/reset-password?token=${encodeURIComponent(params.token)}`;

    await this.transporter.sendMail({
      to: params.to,
      subject: 'Parolni tiklash — CoinLearn',
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: auto;">
          <h2>Parolni tiklash</h2>
          <p>Salom, <b>${escapeHtml(params.fullName)}</b>!</p>
          <p>Parolni tiklash uchun quyidagi tugmani bosing:</p>
          <a href="${escapeHtml(resetLink)}"
             style="display:inline-block;padding:12px 24px;background:#6366f1;
                    color:#fff;border-radius:8px;text-decoration:none;">
            Parolni tiklash
          </a>
          <p style="color:#888;font-size:13px;margin-top:16px;">
            Havola 1 soat davomida amal qiladi.<br>
            Agar siz so'rov yubormagan bo'lsangiz, bu xabarni e'tiborsiz qoldiring.
          </p>
        </div>
      `,
    });
  }
}

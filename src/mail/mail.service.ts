import { Injectable } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD,
    },
  });

  async sendPasswordReset(params: {
    to: string;
    fullName: string;
    token: string;
  }) {
    const resetLink = `${process.env.FRONTEND_URL!}/reset-password?token=${params.token}`;

    await this.transporter.sendMail({
      to: params.to,
      subject: 'Parolni tiklash — CoinLearn',
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: auto;">
          <h2>Parolni tiklash</h2>
          <p>Salom, <b>${params.fullName}</b>!</p>
          <p>Parolni tiklash uchun quyidagi tugmani bosing:</p>
          <a href="${resetLink}"
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

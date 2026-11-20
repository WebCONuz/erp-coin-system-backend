import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { MailService } from 'src/mail/mail.service';
import { PrismaService } from 'src/prisma/prisma.service';
import {
  EmailStatus,
  EmailTriggerType,
  SmsRecipientType,
  SmsStatus,
  SmsTriggerType,
} from 'src/generated/prisma/enums';
import { SendMessageDto, MessageChannel } from './dto/send-message.dto';
import { randomUUID } from 'crypto';
import { AuditActionType } from 'src/generated/prisma/client';
import { AuditLogService } from 'src/audit-log/audit-log.service';
import { AUDIT_ENTITY, AuditEntityType } from 'src/audit-log/utils/audit-entry';

const ESKIZ_BASE_URL = 'https://notify.eskiz.uz/api';
// Tashqi servis javob bermasa so'rov osilib qolmasin
const ESKIZ_TIMEOUT_MS = 10_000;
// Logdagi xato matni chegarasi
const ERROR_MESSAGE_MAX = 500;

type ChannelResult = { channel: string; success: boolean; error?: string };

export interface MessageSender {
  id: string;
  fullName: string;
}

@Injectable()
export class MessagesService {
  private readonly logger = new Logger(MessagesService.name);
  private eskizToken: string | null = null;
  private eskizTokenExpiry: number = 0;

  constructor(
    private readonly config: ConfigService,
    private readonly mail: MailService,
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
  ) {}

  async send(dto: SendMessageDto, tenantId: string, sender: MessageSender) {
    // Barcha kanallar uchun qabul qiluvchi oldindan tekshiriladi — bir kanal yuborilib,
    // ikkinchisi xato bilan to'xtab qolmasligi uchun
    const wantsSms = dto.channels.includes(MessageChannel.sms);
    const wantsEmail = dto.channels.includes(MessageChannel.email);
    if (wantsSms && !dto.recipientPhone) {
      throw new BadRequestException('SMS uchun recipientPhone majburiy');
    }
    if (wantsEmail && !dto.recipientEmail) {
      throw new BadRequestException('Email uchun recipientEmail majburiy');
    }

    // Qabul qiluvchi tenant useriga bog'lansa — u shu tenantda bo'lishi shart
    if (dto.userId) {
      const user = await this.prisma.user.findFirst({
        where: { id: dto.userId, tenantId, isDeleted: false },
        select: { id: true },
      });
      if (!user) throw new NotFoundException('Foydalanuvchi topilmadi');
    }

    const results: ChannelResult[] = [];

    if (wantsSms) {
      results.push(
        await this.sendSmsLogged(dto, dto.recipientPhone!, tenantId, sender),
      );
    }
    if (wantsEmail) {
      results.push(
        await this.sendEmailLogged(dto, dto.recipientEmail!, tenantId, sender),
      );
    }

    const allSuccess = results.every((r) => r.success);
    return {
      message: allSuccess
        ? 'Xabar muvaffaqiyatli yuborildi'
        : 'Xabar qisman yuborildi',
      results,
    };
  }

  // Log avval `pending` holatda yoziladi (yuborish jarayonida server to'xtasa ham iz qoladi),
  // natijaga qarab `sent` / `failed` ga o'zgartiriladi
  private async sendSmsLogged(
    dto: SendMessageDto,
    phone: string,
    tenantId: string,
    sender: MessageSender,
  ): Promise<ChannelResult> {
    const log = { id: randomUUID() };
    await this.prisma.$transaction([
      this.prisma.smsLog.create({
        data: {
          id: log.id,
          tenantId,
          sentById: sender.id,
          studentId: dto.userId ?? null,
          // Tenant useriga bog'lanmagan raqam — ota-ona yoki lid
          recipientType: dto.userId
            ? SmsRecipientType.student
            : SmsRecipientType.parent,
          phone,
          body: dto.message,
          triggerType: SmsTriggerType.custom,
          status: SmsStatus.pending,
        },
        select: { id: true },
      }),
      this.auditSend(
        AuditActionType.sms_sent,
        AUDIT_ENTITY.smsLog,
        log.id,
        tenantId,
        sender,
        dto,
      ),
    ]);

    try {
      const messageId = await this.sendSms(phone, dto.message);
      await this.prisma.smsLog.update({
        where: { id: log.id },
        data: {
          status: SmsStatus.sent,
          sentAt: new Date(),
          eskizMessageId: messageId,
        },
      });
      return { channel: 'sms', success: true };
    } catch (err) {
      const detail = this.errorText(err);
      this.logger.error(`SMS xatolik [log ${log.id}]: ${detail}`);
      await this.prisma.smsLog.update({
        where: { id: log.id },
        data: { status: SmsStatus.failed, errorMessage: detail },
      });
      return { channel: 'sms', success: false, error: 'SMS yuborilmadi' };
    }
  }

  private async sendEmailLogged(
    dto: SendMessageDto,
    email: string,
    tenantId: string,
    sender: MessageSender,
  ): Promise<ChannelResult> {
    const subject =
      dto.subject?.trim() || `CoinLearn — ${sender.fullName} dan xabar`;

    const log = { id: randomUUID() };
    await this.prisma.$transaction([
      this.prisma.emailLog.create({
        data: {
          id: log.id,
          tenantId,
          sentById: sender.id,
          studentId: dto.userId ?? null,
          email,
          subject,
          body: dto.message,
          triggerType: EmailTriggerType.custom,
          status: EmailStatus.pending,
        },
        select: { id: true },
      }),
      this.auditSend(
        AuditActionType.email_sent,
        AUDIT_ENTITY.emailLog,
        log.id,
        tenantId,
        sender,
        dto,
      ),
    ]);

    try {
      await this.mail.sendCustomMessage({
        to: email,
        subject,
        message: dto.message,
        senderName: sender.fullName,
      });
      await this.prisma.emailLog.update({
        where: { id: log.id },
        data: { status: EmailStatus.sent, sentAt: new Date() },
      });
      return { channel: 'email', success: true };
    } catch (err) {
      const detail = this.errorText(err);
      this.logger.error(`Email xatolik [log ${log.id}]: ${detail}`);
      await this.prisma.emailLog.update({
        where: { id: log.id },
        data: { status: EmailStatus.failed, errorMessage: detail },
      });
      return { channel: 'email', success: false, error: 'Email yuborilmadi' };
    }
  }

  // Yuborishga urinish audit izi (log bilan bitta tx'da). Yetkazilgani — log `status` ida
  private auditSend(
    action: AuditActionType,
    entityType: AuditEntityType,
    logId: string,
    tenantId: string,
    sender: MessageSender,
    dto: SendMessageDto,
  ) {
    return this.prisma.auditLog.create({
      data: this.audit.data({
        tenantId,
        actorId: sender.id,
        action,
        entityType,
        entityId: logId,
        changes: {
          userId: dto.userId ?? null,
          messageLength: dto.message.length,
        },
      }),
    });
  }

  private errorText(err: unknown): string {
    const text = err instanceof Error ? err.message : String(err);
    return text.slice(0, ERROR_MESSAGE_MAX);
  }

  // ─── SMS — Eskiz.uz ────────────────────────────────────────────
  // Muvaffaqiyatli bo'lsa Eskiz xabar ID'sini qaytaradi. Token eskirgan bo'lsa (401) —
  // bir marta yangi token bilan qayta urinadi
  private async sendSms(
    phone: string,
    message: string,
  ): Promise<string | null> {
    const sender = this.config.get<string>('ESKIZ_SENDER') ?? '4546';
    // Telefon raqamni xalqaro formatdan Eskiz formatiga o'tkazish (+998 → 998...)
    const body = {
      mobile_phone: phone.replace(/^\+/, ''),
      message,
      from: sender,
    };

    const post = async () => {
      const token = await this.getEskizToken();
      return axios.post<{ id?: unknown }>(
        `${ESKIZ_BASE_URL}/message/sms/send`,
        body,
        {
          headers: { Authorization: `Bearer ${token}` },
          timeout: ESKIZ_TIMEOUT_MS,
        },
      );
    };

    let res: Awaited<ReturnType<typeof post>>;
    try {
      res = await post();
    } catch (err) {
      if (!axios.isAxiosError(err) || err.response?.status !== 401) throw err;
      this.eskizToken = null;
      res = await post();
    }

    const id = res.data?.id;
    return typeof id === 'string' || typeof id === 'number' ? String(id) : null;
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
      `${ESKIZ_BASE_URL}/auth/login`,
      { email, password },
      { timeout: ESKIZ_TIMEOUT_MS },
    );

    this.eskizToken = res.data.data.token;
    this.eskizTokenExpiry = Date.now() + 29 * 60 * 1000;

    return this.eskizToken;
  }
}

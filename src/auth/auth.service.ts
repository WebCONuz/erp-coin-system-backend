import {
  Injectable,
  Logger,
  UnauthorizedException,
  BadRequestException,
  NotFoundException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { MailService } from '../mail/mail.service';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { Response } from 'express';
import { TokenService } from './token.service';
import { AuthPayloadType, ClientMeta } from 'src/common/types';
import {
  ACTIVE_ACCOUNT_WHERE,
  AUTH_ERROR_CODES,
} from './constants/active-account';
import { BCRYPT_ROUNDS } from 'src/users/constants/password';
import { generateOpaqueToken, hashToken } from 'src/common/utils/token-hash';
import {
  classifyRefreshToken,
  MAX_SESSIONS_PER_USER,
  REFRESH_TOKEN_TTL_MS,
} from './utils/refresh-session';

// Mavjud bo'lmagan username uchun ham bcrypt.compare ishlashi uchun (timing orqali enumeratsiyaga qarshi).
// Cost haqiqiy parollar bilan bir xil bo'lishi shart — aks holda javob vaqti farq qiladi
const DUMMY_PASSWORD_HASH = bcrypt.hashSync(
  'dummy-password-for-timing',
  BCRYPT_ROUNDS,
);

const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000; // 1 soat

type UserForToken = {
  id: string;
  username: string;
  phone: string;
  tenantId: string;
  roleId: string;
  role: { name: string };
};

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private tokenService: TokenService,
    private mail: MailService,
  ) {}

  private buildPayload(user: UserForToken): AuthPayloadType {
    return {
      sub: user.id,
      username: user.username,
      phone: user.phone,
      role: user.role.name,
      tenantId: user.tenantId,
      roleId: user.roleId,
    };
  }

  // ─── Login ────────────────────────────────────────────────────
  async login(dto: LoginDto, res: Response, meta: ClientMeta = {}) {
    // Username butun tizimda unique — telefon esa turli tenantlarda takrorlanishi mumkin
    const user = await this.prisma.user.findUnique({
      where: { username: dto.username },
      include: {
        role: true,
        tenant: { select: { isActive: true, isDeleted: true } },
      },
      omit: { passwordHash: false }, // global omit'dan istisno — parolni tekshirish uchun
    });

    // User topilmasa ham bcrypt ishlatiladi — javob vaqti orqali username mavjudligini bilib bo'lmasin
    const passwordMatch = await bcrypt.compare(
      dto.password,
      user?.passwordHash ?? DUMMY_PASSWORD_HASH,
    );

    if (!user || !user.isActive || user.isDeleted || !passwordMatch) {
      throw new BadRequestException("Username yoki parol noto'g'ri");
    }

    // Tenant holati faqat parol to'g'ri bo'lgandagina oshkor qilinadi
    if (!user.tenant.isActive || user.tenant.isDeleted) {
      throw new HttpException(
        {
          statusCode: HttpStatus.FORBIDDEN,
          message:
            "Tashkilotingiz faoliyati vaqtincha to'xtatilgan. Administratorga murojaat qiling",
          code: AUTH_ERROR_CODES.TENANT_INACTIVE,
        },
        HttpStatus.FORBIDDEN,
      );
    }

    const payload = this.buildPayload(user);
    const refreshToken = await this.createSession(user.id, payload, meta);
    const accessToken = this.tokenService.generateAccessToken(payload);

    this.tokenService.setTokenCookies(res, accessToken, refreshToken);

    return {
      status: 'success',
      message: 'Login successfully',
      user: {
        id: user.id,
        username: user.username,
        phone: user.phone,
        fullName: user.fullName,
        role: user.role.name,
        tenantId: user.tenantId,
      },
    };
  }

  // Har bir login — alohida qurilma sessiyasi. Boshqa qurilmalardagi sessiyalar saqlanadi;
  // muddati o'tganlari tozalanadi, faol sessiyalar soni MAX_SESSIONS_PER_USER bilan cheklanadi
  private async createSession(
    userId: string,
    payload: AuthPayloadType,
    meta: ClientMeta,
  ): Promise<string> {
    const sessionId = randomUUID();
    const refreshToken = this.tokenService.generateRefreshToken({
      ...payload,
      sid: sessionId,
    });
    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      await tx.refreshSession.deleteMany({
        where: { userId, expiresAt: { lte: now } },
      });
      await tx.refreshSession.create({
        data: {
          id: sessionId,
          userId,
          tokenHash: hashToken(refreshToken),
          expiresAt: new Date(now.getTime() + REFRESH_TOKEN_TTL_MS),
          userAgent: meta.userAgent?.slice(0, 300) ?? null,
          ipAddress: meta.ipAddress?.slice(0, 64) ?? null,
        },
      });

      const overflow = await tx.refreshSession.findMany({
        where: { userId },
        orderBy: { lastUsedAt: 'desc' },
        skip: MAX_SESSIONS_PER_USER,
        select: { id: true },
      });
      if (overflow.length) {
        await tx.refreshSession.deleteMany({
          where: { id: { in: overflow.map((s) => s.id) } },
        });
      }
    });

    return refreshToken;
  }

  // ─── Token yangilash ──────────────────────────────────────────
  async refresh(refreshToken: string | undefined, res: Response) {
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token topilmadi');
    }

    let payload: ReturnType<TokenService['verifyRefreshToken']>;
    try {
      payload = this.tokenService.verifyRefreshToken(refreshToken);
    } catch {
      throw new UnauthorizedException(
        "Refresh token yaroqsiz yoki muddati o'tgan",
      );
    }
    // Eski formatdagi (sessiyasiz) token — qayta login kerak
    if (!payload.sid) {
      throw new UnauthorizedException('Sessiya tugagan. Qayta kiring');
    }

    const session = await this.prisma.refreshSession.findFirst({
      where: { id: payload.sid, userId: payload.sub },
    });
    if (!session) {
      throw new UnauthorizedException('Sessiya tugagan. Qayta kiring');
    }

    const presentedHash = hashToken(refreshToken);
    const now = new Date();
    const match = classifyRefreshToken(session, presentedHash, now);

    if (match === 'expired' || match === 'reuse') {
      // reuse: aylantirilgan eski token qayta ishlatildi — token o'g'irlangan bo'lishi
      // mumkin, shu qurilma sessiyasi butunlay yopiladi (boshqa qurilmalar ta'sirlanmaydi)
      await this.prisma.refreshSession.deleteMany({
        where: { id: session.id },
      });
      if (match === 'reuse') {
        this.logger.warn(
          `Refresh token qayta ishlatildi — sessiya bekor qilindi (user ${session.userId})`,
        );
      }
      throw new UnauthorizedException('Sessiya tugagan. Qayta kiring');
    }

    const user = await this.prisma.user.findFirst({
      where: { id: payload.sub, ...ACTIVE_ACCOUNT_WHERE },
      include: { role: true },
    });
    if (!user) {
      await this.prisma.refreshSession.deleteMany({
        where: { id: session.id },
      });
      throw new UnauthorizedException('Foydalanuvchi topilmadi');
    }

    const newPayload = this.buildPayload(user);
    const newAccessToken = this.tokenService.generateAccessToken(newPayload);

    if (match === 'current') {
      const newRefreshToken = this.tokenService.generateRefreshToken({
        ...newPayload,
        sid: session.id,
      });
      // Shartli aylantirish: parallel so'rovlardan faqat bittasi tokenni almashtiradi
      const { count } = await this.prisma.refreshSession.updateMany({
        where: { id: session.id, tokenHash: presentedHash },
        data: {
          tokenHash: hashToken(newRefreshToken),
          previousTokenHash: presentedHash,
          rotatedAt: now,
          lastUsedAt: now,
          expiresAt: new Date(now.getTime() + REFRESH_TOKEN_TTL_MS),
        },
      });
      if (count === 1) {
        this.tokenService.setTokenCookies(res, newAccessToken, newRefreshToken);
        return { message: 'Token yangilandi' };
      }
      // count === 0 — shu orada boshqa tab aylantirdi: muhlat holatidagidek javob
    }

    // grace: boshqa tab tokenni hozirgina aylantirgan — refresh cookie'ga tegilmaydi
    // (u o'sha tabning javobida yangilanadi), faqat yangi access token beriladi
    this.tokenService.setAccessCookie(res, newAccessToken);
    return { message: 'Token yangilandi' };
  }

  // ─── Logout (faqat joriy qurilma) ─────────────────────────────
  // Access token shart emas: muddati o'tgan bo'lsa ham refresh cookie bo'yicha sessiya yopiladi
  async logout(refreshToken: string | undefined, res: Response) {
    if (refreshToken) {
      try {
        const payload = this.tokenService.verifyRefreshToken(refreshToken, {
          ignoreExpiration: true,
        });
        if (payload.sid) {
          await this.prisma.refreshSession.deleteMany({
            where: { id: payload.sid, userId: payload.sub },
          });
        }
      } catch {
        // Yaroqsiz token — yopiladigan sessiya yo'q, cookie'lar baribir tozalanadi
      }
    }

    this.tokenService.clearTokenCookies(res);
    return { message: 'Muvaffaqiyatli chiqildi' };
  }

  // ─── Barcha qurilmalardan chiqish ─────────────────────────────
  async logoutAll(userId: string, res: Response) {
    await this.prisma.refreshSession.deleteMany({ where: { userId } });
    this.tokenService.clearTokenCookies(res);
    return { message: 'Barcha qurilmalardan chiqildi' };
  }

  // ─── Me ───────────────────────────────────────────────────────
  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        role: true,
        wallet: { select: { balance: true } },
        // Frontend tenant turiga qarab menyu/maydonlarni ko'rsatadi (TenantController faqat super_admin uchun)
        tenant: { select: { id: true, name: true, slug: true, type: true } },
      },
    });
    if (!user) throw new NotFoundException('Foydalanuvchi topilmadi');

    // Maxfiy maydonlar (parol hash, tokenlar) PrismaService global omit orqali yashirilgan
    return {
      status: 'success',
      message: 'Your full datas',
      data: user,
    };
  }

  // ─── Forgot password ─────────────────────────────────────────
  async forgotPassword(dto: ForgotPasswordDto) {
    const response = {
      message: "Agar foydalanuvchining emaili bo'lsa, unga xabar yuborildi",
    };

    // Email unique emas (bir odam turli tenantlarda bir xil email ishlatishi mumkin),
    // shuning uchun user username bo'yicha topiladi va xat uning emailiga yuboriladi
    const user = await this.prisma.user.findFirst({
      where: { username: dto.username, ...ACTIVE_ACCOUNT_WHERE },
    });

    // Xavfsizlik uchun: user topilmasa yoki emaili bo'lmasa ham xato ko'rsatmaymiz
    if (!user || !user.email) return response;

    // Bir martalik token: userga xom holda (emailda), DB'ga faqat sha256 hash
    const resetToken = generateOpaqueToken();

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordResetToken: hashToken(resetToken),
        passwordResetExpiry: new Date(Date.now() + PASSWORD_RESET_TTL_MS),
      },
    });

    // Email fonda yuboriladi: javob vaqti SMTP'ga bog'liq bo'lmaydi (enumeratsiyaga qarshi),
    // SMTP xatosi esa klientga 500 bo'lib chiqmaydi — faqat logga yoziladi
    const to = user.email;
    void this.mail
      .sendPasswordReset({ to, fullName: user.fullName, token: resetToken })
      .catch((err: unknown) =>
        this.logger.error(
          `Parol tiklash xatini yuborib bo'lmadi (user ${user.id}): ${err instanceof Error ? err.message : String(err)}`,
        ),
      );

    return response;
  }

  // ─── Reset password ───────────────────────────────────────────
  async resetPassword(dto: ResetPasswordDto) {
    const user = await this.prisma.user.findFirst({
      where: {
        passwordResetToken: hashToken(dto.token),
        passwordResetExpiry: { gt: new Date() }, // muddati o'tmagan
        ...ACTIVE_ACCOUNT_WHERE,
      },
      select: { id: true },
    });

    if (!user) {
      throw new BadRequestException("Token yaroqsiz yoki muddati o'tgan");
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, BCRYPT_ROUNDS);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: user.id },
        data: {
          passwordHash,
          passwordResetToken: null,
          passwordResetExpiry: null,
        },
      }),
      // Barcha qurilmalardan chiqarish
      this.prisma.refreshSession.deleteMany({ where: { userId: user.id } }),
    ]);

    return { message: "Parol muvaffaqiyatli o'zgartirildi. Qayta kiring." };
  }
}

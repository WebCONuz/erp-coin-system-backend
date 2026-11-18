import {
  Injectable,
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
import * as crypto from 'crypto';
import { Response } from 'express';
import { TokenService } from './token.service';
import { AuthPayloadType } from 'src/common/types';
import {
  ACTIVE_ACCOUNT_WHERE,
  AUTH_ERROR_CODES,
} from './constants/active-account';

// Mavjud bo'lmagan username uchun ham bcrypt.compare ishlashi uchun (timing orqali enumeratsiyaga qarshi)
const DUMMY_PASSWORD_HASH = bcrypt.hashSync('dummy-password-for-timing', 10);

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private tokenService: TokenService,
    private mail: MailService,
  ) {}

  // ─── Login ────────────────────────────────────────────────────
  async login(dto: LoginDto, res: Response) {
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

    const payload: AuthPayloadType = {
      sub: user.id,
      username: user.username,
      phone: user.phone,
      role: user.role.name,
      tenantId: user.tenantId,
      roleId: user.roleId,
    };

    const accessToken = this.tokenService.generateAccessToken(payload);
    const refreshToken = this.tokenService.generateRefreshToken(payload);

    // Refresh tokenni hash qilib DB ga saqlash
    const refreshHash = await bcrypt.hash(refreshToken, 10);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { refreshTokenHash: refreshHash },
    });

    // Cookie ga yozish
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

  // ─── Token yangilash ──────────────────────────────────────────
  async refresh(refreshToken: string, res: Response) {
    if (!refreshToken) {
      throw new BadRequestException('Refresh token topilmadi');
    }

    let payload: AuthPayloadType;
    try {
      payload = this.tokenService.verifyRefreshToken(refreshToken);
    } catch {
      throw new UnauthorizedException(
        "Refresh token yaroqsiz yoki muddati o'tgan",
      );
    }

    const user = await this.prisma.user.findFirst({
      where: { id: payload.sub, ...ACTIVE_ACCOUNT_WHERE },
      include: { role: true },
      omit: { refreshTokenHash: false }, // global omit'dan istisno — tokenni solishtirish uchun
    });

    if (!user || !user.refreshTokenHash) {
      throw new NotFoundException('Foydalanuvchi topilmadi');
    }

    const tokenMatch = await bcrypt.compare(
      refreshToken,
      user.refreshTokenHash,
    );
    if (!tokenMatch) {
      throw new UnauthorizedException('Refresh token mos kelmadi');
    }

    const newPayload: AuthPayloadType = {
      sub: user.id,
      username: user.username,
      phone: user.phone,
      role: user.role.name,
      tenantId: user.tenantId,
      roleId: user.roleId,
    };

    const newAccessToken = this.tokenService.generateAccessToken(newPayload);
    const newRefreshToken = this.tokenService.generateRefreshToken(newPayload);

    // Yangi refresh tokenni saqlash
    const refreshHash = await bcrypt.hash(newRefreshToken, 10);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { refreshTokenHash: refreshHash },
    });

    this.tokenService.setTokenCookies(res, newAccessToken, newRefreshToken);

    return { message: 'Token yangilandi' };
  }

  // ─── Logout ───────────────────────────────────────────────────
  async logout(userId: string, res: Response) {
    // DB dan refresh tokenni o'chirish
    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshTokenHash: null },
    });

    // Cookielarni o'chirish
    res.clearCookie('access_token');
    res.clearCookie('refresh_token');

    return { message: 'Muvaffaqiyatli chiqildi' };
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
    // Email unique emas (bir odam turli tenantlarda bir xil email ishlatishi mumkin),
    // shuning uchun user username bo'yicha topiladi va xat uning emailiga yuboriladi
    const user = await this.prisma.user.findFirst({
      where: { username: dto.username, ...ACTIVE_ACCOUNT_WHERE },
    });

    // Xavfsizlik uchun: user topilmasa yoki emaili bo'lmasa ham xato ko'rsatmaymiz
    if (!user || !user.email) {
      return {
        message: "Agar foydalanuvchining emaili bo'lsa, unga xabar yuborildi",
      };
    }

    // Bir martalik token yaratish
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetExpiry = new Date(Date.now() + 1000 * 60 * 60); // 1 soat

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordResetToken: resetToken,
        passwordResetExpiry: resetExpiry,
      },
    });

    // Emailga xabar yuborish
    await this.mail.sendPasswordReset({
      to: user.email,
      fullName: user.fullName,
      token: resetToken,
    });

    return {
      message: "Agar foydalanuvchining emaili bo'lsa, unga xabar yuborildi",
    };
  }

  // ─── Reset password ───────────────────────────────────────────
  async resetPassword(dto: ResetPasswordDto) {
    const user = await this.prisma.user.findFirst({
      where: {
        passwordResetToken: dto.token,
        passwordResetExpiry: { gt: new Date() }, // muddati o'tmagan
        ...ACTIVE_ACCOUNT_WHERE,
      },
    });

    if (!user) {
      throw new BadRequestException("Token yaroqsiz yoki muddati o'tgan");
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, 10);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        passwordResetToken: null,
        refreshTokenHash: null, // barcha qurilmalardan chiqarish
        passwordResetExpiry: null,
      },
    });

    return { message: "Parol muvaffaqiyatli o'zgartirildi. Qayta kiring." };
  }
}

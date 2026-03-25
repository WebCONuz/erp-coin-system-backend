import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { MailService } from '../mail/mail.service';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { Response } from 'express';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
    private mail: MailService,
  ) {}

  // ─── Login ────────────────────────────────────────────────────
  async login(dto: LoginDto, res: Response) {
    const user = await this.prisma.user.findUnique({
      where: { phone: dto.phone },
      include: { role: true },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException("Telefon raqam yoki parol noto'g'ri");
    }

    const passwordMatch = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordMatch) {
      throw new UnauthorizedException("Telefon raqam yoki parol noto'g'ri");
    }

    const payload = {
      sub: user.id,
      phone: user.phone,
      role: user.role.name,
      tenantId: user.tenantId,
    };

    const accessToken = this.generateAccessToken(payload);
    const refreshToken = this.generateRefreshToken(payload);

    // Refresh tokenni hash qilib DB ga saqlash
    const refreshHash = await bcrypt.hash(refreshToken, 10);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { refreshTokenHash: refreshHash },
    });

    // Cookie ga yozish
    this.setTokenCookies(res, accessToken, refreshToken);

    return {
      status: 'success',
      message: 'Login successfully',
      user: {
        id: user.id,
        fullName: user.fullName,
        phone: user.phone,
        role: user.role.name,
        tenantId: user.tenantId,
      },
    };
  }

  // ─── Token yangilash ──────────────────────────────────────────
  async refresh(refreshToken: string, res: Response) {
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token topilmadi');
    }

    let payload: any;
    try {
      payload = this.jwt.verify(refreshToken, {
        secret: this.config.get('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException(
        "Refresh token yaroqsiz yoki muddati o'tgan",
      );
    }

    const user = await this.prisma.user.findFirst({
      where: { id: payload.sub, isActive: true },
      include: { role: true },
    });

    if (!user || !user.refreshTokenHash) {
      throw new UnauthorizedException('Foydalanuvchi topilmadi');
    }

    const tokenMatch = await bcrypt.compare(
      refreshToken,
      user.refreshTokenHash,
    );
    if (!tokenMatch) {
      throw new UnauthorizedException('Refresh token mos kelmadi');
    }

    const newPayload = {
      sub: user.id,
      phone: user.phone,
      role: user.role.name,
      tenantId: user.tenantId,
    };

    const newAccessToken = this.generateAccessToken(newPayload);
    const newRefreshToken = this.generateRefreshToken(newPayload);

    // Yangi refresh tokenni saqlash
    const refreshHash = await bcrypt.hash(newRefreshToken, 10);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { refreshTokenHash: refreshHash },
    });

    this.setTokenCookies(res, newAccessToken, newRefreshToken);

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
      },
    });
    if (!user) throw new UnauthorizedException('Foydalanuvchi topilmadi');

    const { passwordHash, refreshTokenHash, ...safeUser } = user;
    return {
      status: 'success',
      message: 'Your full datas',
      data: safeUser,
    };
  }

  // ─── Forgot password ─────────────────────────────────────────
  async forgotPassword(dto: ForgotPasswordDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    // Xavfsizlik uchun: user topilmasa ham xato ko'rsatmaymiz
    if (!user || !user.isActive) {
      return { message: "Agar email ro'yxatda bo'lsa, xabar yuborildi" };
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

    await this.mail.sendPasswordReset({
      to: user.email!,
      fullName: user.fullName,
      token: resetToken,
    });

    return { message: "Agar email ro'yxatda bo'lsa, xabar yuborildi" };
  }

  // ─── Reset password ───────────────────────────────────────────
  async resetPassword(dto: ResetPasswordDto) {
    const user = await this.prisma.user.findFirst({
      where: {
        passwordResetToken: dto.token,
        passwordResetExpiry: { gt: new Date() }, // muddati o'tmagan
        isActive: true,
      },
    });

    if (!user) {
      throw new BadRequestException("Token yaroqsiz yoki muddati o'tgan");
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, 12);

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

  // ─── Helpers ──────────────────────────────────────────────────
  private generateAccessToken(payload: object) {
    return this.jwt.sign(payload, {
      secret: this.config.get('JWT_ACCESS_SECRET'),
      expiresIn: '15m',
    });
  }

  private generateRefreshToken(payload: object) {
    return this.jwt.sign(payload, {
      secret: this.config.get('JWT_REFRESH_SECRET'),
      expiresIn: '1d',
    });
  }

  private setTokenCookies(
    res: Response,
    accessToken: string,
    refreshToken: string,
  ) {
    const isProd = this.config.get('NODE_ENV') === 'production';

    res.cookie('access_token', accessToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? 'strict' : 'lax',
      maxAge: 1000 * 60 * 15, // 15 daqiqa
    });

    res.cookie('refresh_token', refreshToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? 'strict' : 'lax',
      maxAge: 1000 * 60 * 60 * 24, // 1 kun
    });
  }
}

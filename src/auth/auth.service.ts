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
import { TokenService } from './token.service';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private tokenService: TokenService,
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
      payload = this.tokenService.verifyRefreshToken(refreshToken);
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

    // Emailga xabar yuborish
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
}

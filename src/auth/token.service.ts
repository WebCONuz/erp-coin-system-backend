import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { CookieOptions, Response } from 'express';
import { randomUUID } from 'crypto';
import { AuthPayloadType, RefreshPayloadType } from 'src/common/types';
import { REFRESH_TOKEN_TTL_MS } from './utils/refresh-session';

const ACCESS_TOKEN_TTL_MS = 15 * 60 * 1000;

@Injectable()
export class TokenService {
  constructor(
    private jwt: JwtService,
    private config: ConfigService,
  ) {}

  /**
   * Access token yaratadi (15 daqiqa)
   */
  generateAccessToken(payload: AuthPayloadType): string {
    return this.jwt.sign(payload, {
      secret: this.config.get('JWT_ACCESS_SECRET'),
      expiresIn: '15m',
    });
  }

  /**
   * Refresh token yaratadi (1 kun). `sid` — qurilma sessiyasi; `jwtid` har bir tokenni
   * noyob qiladi (bir soniya ichida ikki marta aylantirilsa ham token takrorlanmaydi)
   */
  generateRefreshToken(payload: RefreshPayloadType): string {
    return this.jwt.sign(payload, {
      secret: this.config.get('JWT_REFRESH_SECRET'),
      expiresIn: Math.floor(REFRESH_TOKEN_TTL_MS / 1000),
      jwtid: randomUUID(),
    });
  }

  private cookieOptions(maxAge?: number): CookieOptions {
    const isProd = this.config.get('NODE_ENV') === 'production';
    return {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? 'strict' : 'lax',
      ...(maxAge !== undefined ? { maxAge } : {}),
    };
  }

  setAccessCookie(res: Response, accessToken: string): void {
    res.cookie(
      'access_token',
      accessToken,
      this.cookieOptions(ACCESS_TOKEN_TTL_MS),
    );
  }

  /**
   * Tokenlarni cookie ga yozadi
   */
  setTokenCookies(
    res: Response,
    accessToken: string,
    refreshToken: string,
  ): void {
    this.setAccessCookie(res, accessToken);
    res.cookie(
      'refresh_token',
      refreshToken,
      this.cookieOptions(REFRESH_TOKEN_TTL_MS),
    );
  }

  /**
   * Cookielarni tozalaydi (yozilgandagi atributlar bilan — brauzer ularni aniq o'chiradi)
   */
  clearTokenCookies(res: Response): void {
    res.clearCookie('access_token', this.cookieOptions());
    res.clearCookie('refresh_token', this.cookieOptions());
  }

  /**
   * Refresh tokenni verify qiladi. `ignoreExpiration` — faqat logout uchun
   * (muddati o'tgan token bilan ham qurilma sessiyasini yopish mumkin)
   */
  verifyRefreshToken(
    refreshToken: string,
    options: { ignoreExpiration?: boolean } = {},
  ): RefreshPayloadType & { iat: number; exp: number } {
    return this.jwt.verify(refreshToken, {
      secret: this.config.get('JWT_REFRESH_SECRET'),
      ignoreExpiration: options.ignoreExpiration ?? false,
    });
  }
}

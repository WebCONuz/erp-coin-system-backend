import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';

export interface TokenPayload {
  sub: string;
  phone: string;
  role: string;
  tenantId: string;
}

@Injectable()
export class TokenService {
  constructor(
    private jwt: JwtService,
    private config: ConfigService,
  ) {}

  /**
   * Access token yaratadi (15 daqiqa)
   */
  generateAccessToken(payload: TokenPayload): string {
    return this.jwt.sign(payload, {
      secret: this.config.get('JWT_ACCESS_SECRET'),
      expiresIn: '15m',
    });
  }

  /**
   * Refresh token yaratadi (1 kun)
   */
  generateRefreshToken(payload: TokenPayload): string {
    return this.jwt.sign(payload, {
      secret: this.config.get('JWT_REFRESH_SECRET'),
      expiresIn: '1d',
    });
  }

  /**
   * Tokenlarni cookie ga yozadi
   */
  setTokenCookies(
    res: Response,
    accessToken: string,
    refreshToken: string,
  ): void {
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

  /**
   * Cookielarni tozalaydi
   */
  clearTokenCookies(res: Response): void {
    res.clearCookie('access_token');
    res.clearCookie('refresh_token');
  }

  /**
   * Refresh tokenni verify qiladi
   */
  verifyRefreshToken(refreshToken: string) {
    return this.jwt.verify(refreshToken, {
      secret: this.config.get('JWT_REFRESH_SECRET'),
    });
  }
}

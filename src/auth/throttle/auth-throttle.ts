import { ExecutionContext, SetMetadata } from '@nestjs/common';
import { ThrottlerOptions } from '@nestjs/throttler';

const AUTH_THROTTLE_KEY = 'authThrottle';

// Login / parol tiklash endpointlariga qo'yiladi — `auth` throttler faqat shu endpointlarda ishlaydi
export const AuthThrottle = () => SetMetadata(AUTH_THROTTLE_KEY, true);

const FIFTEEN_MINUTES = 15 * 60 * 1000;

/**
 * Parolni terib topishga (brute-force) qarshi limit — IP bo'yicha emas, **username** bo'yicha:
 * maktabda butun sinf bitta IP (NAT) orqali kiradi, IP limiti hammani bloklab qo'yardi.
 * Bitta username uchun 15 daqiqada 10 ta urinish; oshsa 15 daqiqa bloklanadi.
 * Body'da username bo'lmasa (masalan reset-password) — IP bo'yicha hisoblanadi.
 * Global `short`/`long` (IP bo'yicha) limitlar ham amalda qoladi.
 */
export const AUTH_THROTTLER: ThrottlerOptions = {
  name: 'auth',
  ttl: FIFTEEN_MINUTES,
  limit: 10,
  blockDuration: FIFTEEN_MINUTES,
  skipIf: (context: ExecutionContext) =>
    !Reflect.getMetadata(AUTH_THROTTLE_KEY, context.getHandler()),
  getTracker: (req: Record<string, any>) => {
    const body = req.body as { username?: unknown } | undefined;
    const username =
      typeof body?.username === 'string'
        ? body.username.trim().toLowerCase()
        : '';
    return username ? `username:${username}` : `ip:${String(req.ip)}`;
  },
};

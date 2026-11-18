import { Injectable } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';

// Maxfiy maydonlar barcha query javoblaridan global yashiriladi — javobga tasodifan
// chiqib ketmasligi uchun. Kerak bo'lgan joyda (login, refresh, parol tekshiruvi)
// query'da aniq so'raladi: `omit: { passwordHash: false }`.
export const SENSITIVE_USER_OMIT = {
  user: {
    passwordHash: true,
    refreshTokenHash: true,
    passwordResetToken: true,
    passwordResetExpiry: true,
  },
} as const;

type PrismaServiceOptions = {
  adapter: PrismaPg;
  omit: typeof SENSITIVE_USER_OMIT;
};

@Injectable()
export class PrismaService extends PrismaClient<PrismaServiceOptions> {
  constructor() {
    const adapter = new PrismaPg({
      connectionString: process.env.DATABASE_URL as string,
    });
    super({ adapter, omit: SENSITIVE_USER_OMIT });
  }
}

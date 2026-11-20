import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';

// Maxfiy maydonlar barcha query javoblaridan global yashiriladi — javobga tasodifan
// chiqib ketmasligi uchun. Kerak bo'lgan joyda (login, refresh, parol tekshiruvi)
// query'da aniq so'raladi: `omit: { passwordHash: false }`.
export const SENSITIVE_USER_OMIT = {
  user: {
    passwordHash: true,
    passwordResetToken: true,
    passwordResetExpiry: true,
  },
} as const;

// Interaktiv tranzaksiyalar uchun standart limitlar (Prisma default: maxWait 2s, timeout 5s).
// Qulf kutish (yo'qlama, coin, jadval sinxronlash) va katta guruhlar uchun kengroq.
const TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 30_000 } as const;

type PrismaServiceOptions = {
  adapter: PrismaPg;
  omit: typeof SENSITIVE_USER_OMIT;
  transactionOptions: typeof TRANSACTION_OPTIONS;
};

@Injectable()
export class PrismaService
  extends PrismaClient<PrismaServiceOptions>
  implements OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor(config: ConfigService) {
    // pg connection pool — bitta instance bir vaqtda ochadigan ulanishlar soni.
    // PgBouncer/Postgres max_connections ga qarab DB_POOL_MAX bilan sozlanadi.
    // Qiymatlar ishga tushishda tekshirilgan (validateEnv)
    const adapter = new PrismaPg({
      connectionString: config.getOrThrow<string>('DATABASE_URL'),
      max: config.get<number>('DB_POOL_MAX') ?? 10,
      idleTimeoutMillis: config.get<number>('DB_POOL_IDLE_MS') ?? 30_000,
      connectionTimeoutMillis:
        config.get<number>('DB_CONNECT_TIMEOUT_MS') ?? 10_000,
    });
    super({
      adapter,
      omit: SENSITIVE_USER_OMIT,
      transactionOptions: TRANSACTION_OPTIONS,
    });
  }

  // Server to'xtaganda (SIGTERM — deploy/restart) ulanishlar toza yopiladi
  async onModuleDestroy() {
    await this.$disconnect();
    this.logger.log('DB ulanishlari yopildi');
  }
}

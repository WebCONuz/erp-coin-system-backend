// Dekoratorlar metadata'si — modul Nest'dan oldin/alohida (testda) yuklansa ham ishlashi uchun
import 'reflect-metadata';
import { plainToInstance, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  Max,
  Min,
  ValidateIf,
  validateSync,
} from 'class-validator';

const isProd = (o: EnvironmentVariables) => o.NODE_ENV === 'production';

/**
 * Server ishga tushishidan oldin tekshiriladigan muhit o'zgaruvchilari. Xato bo'lsa server
 * ishga tushmaydi (birinchi login yoki email paytida emas). Seed uchun kerak bo'lgan
 * CREATOR_* / SUPER_ADMIN_* bu yerda tekshirilmaydi — ular ilovada ishlatilmaydi.
 */
export class EnvironmentVariables {
  @IsOptional()
  @IsIn(['development', 'production', 'test'])
  NODE_ENV: 'development' | 'production' | 'test' = 'development';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT?: number;

  @IsString()
  @Matches(/^postgres(ql)?:\/\//, {
    message: 'DATABASE_URL postgresql:// bilan boshlanishi kerak',
  })
  DATABASE_URL!: string;

  @IsString()
  @IsNotEmpty()
  JWT_ACCESS_SECRET!: string;

  @IsString()
  @IsNotEmpty()
  JWT_REFRESH_SECRET!: string;

  // Production'da yagona ruxsat etilgan CORS origin va parol tiklash havolasi manzili
  @ValidateIf((o: EnvironmentVariables) => isProd(o) || !!o.FRONTEND_DOMEN)
  @IsUrl({ require_protocol: true, require_tld: false })
  FRONTEND_DOMEN?: string;

  // Email (parol tiklash, xabarlar) — ixtiyoriy; berilmasa email yuborilmaydi (logda xato)
  @IsOptional()
  @IsString()
  SMTP_HOST?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  SMTP_PORT?: number;

  @IsOptional()
  @IsString()
  SMTP_USER?: string;

  @IsOptional()
  @IsString()
  SMTP_PASSWORD?: string;

  @IsOptional()
  @IsString()
  ESKIZ_EMAIL?: string;

  @IsOptional()
  @IsString()
  ESKIZ_PASSWORD?: string;

  @IsOptional()
  @IsString()
  ESKIZ_SENDER?: string;

  @IsOptional()
  @IsString()
  SWAGGER_USER?: string;

  @IsOptional()
  @IsString()
  SWAGGER_PASSWORD?: string;

  @IsOptional()
  @IsIn(['true', 'false'])
  SWAGGER_ENABLED?: string;

  // Proxy soni ("1") yoki express'ning trust proxy qiymati ("loopback" va h.k.)
  @IsOptional()
  @IsString()
  TRUST_PROXY?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  DB_POOL_MAX?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1000)
  DB_POOL_IDLE_MS?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1000)
  DB_CONNECT_TIMEOUT_MS?: number;
}

// Production'da JWT kalitlari kamida shuncha belgi va o'zaro farqli bo'lishi shart
export const PROD_SECRET_MIN_LENGTH = 32;

/**
 * `ConfigModule.forRoot({ validate })` uchun: tekshirilgan va turlari keltirilgan
 * (raqamlar — number) obyekt qaytaradi, xatoda barcha muammolar ro'yxati bilan Error.
 */
export function validateEnv(
  config: Record<string, unknown>,
): EnvironmentVariables {
  const env = plainToInstance(EnvironmentVariables, config);
  const problems = validateSync(env).flatMap((e) =>
    Object.values(e.constraints ?? {}).map((msg) => `${e.property}: ${msg}`),
  );

  if (isProd(env)) {
    for (const name of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'] as const) {
      if ((env[name] ?? '').length < PROD_SECRET_MIN_LENGTH) {
        problems.push(
          `${name}: production'da kamida ${PROD_SECRET_MIN_LENGTH} belgi bo'lishi kerak`,
        );
      }
    }
    if (
      env.JWT_ACCESS_SECRET &&
      env.JWT_ACCESS_SECRET === env.JWT_REFRESH_SECRET
    ) {
      problems.push(
        "JWT_ACCESS_SECRET va JWT_REFRESH_SECRET bir xil bo'lmasligi kerak",
      );
    }
  }

  if (problems.length) {
    throw new Error(
      `Muhit o'zgaruvchilari (.env) noto'g'ri:\n  - ${problems.join('\n  - ')}`,
    );
  }
  return env;
}

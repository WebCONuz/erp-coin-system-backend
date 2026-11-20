import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger, ValidationPipe } from '@nestjs/common';
import * as cookieParser from 'cookie-parser';
import * as basicAuth from 'express-basic-auth';
import { Handler } from 'express';
import helmet from 'helmet';
import * as express from 'express';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { UPLOADS_ROOT } from './common/utils/image-upload';
import { IDEMPOTENCY_REPLAYED_HEADER } from './common/idempotency/idempotency';
import { AppLogger } from './common/logger/app.logger';
import {
  REQUEST_ID_HEADER,
  requestIdMiddleware,
} from './common/middleware/request-id.middleware';
import { EnvironmentVariables } from './config/env.validation';

const logger = new Logger('Bootstrap');

// Frontend dev serverlari — faqat production bo'lmagan muhitda ruxsat etiladi
const DEV_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:3000',
];

type AppConfig = ConfigService<EnvironmentVariables, true>;

function setupSwagger(
  app: NestExpressApplication,
  config: AppConfig,
  isProd: boolean,
) {
  // Production'da Swagger faqat SWAGGER_ENABLED=true bo'lsa ochiladi
  if (isProd && config.get('SWAGGER_ENABLED', { infer: true }) !== 'true') {
    return;
  }

  let user = config.get('SWAGGER_USER', { infer: true });
  let password = config.get('SWAGGER_PASSWORD', { infer: true });

  if (!user || !password) {
    if (isProd) {
      logger.warn(
        "SWAGGER_USER / SWAGGER_PASSWORD berilmagan — Swagger production'da ochilmadi",
      );
      return;
    }
    // Lokal dev uchun qulaylik — production'da bu qiymatlar hech qachon ishlatilmaydi
    user = 'kottaAdmin';
    password = '12345';
  }

  const authMiddleware = basicAuth as unknown as (options: unknown) => Handler;
  app.use(
    ['/api/docs'],
    authMiddleware({ users: { [user]: password }, challenge: true }),
  );

  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Enter your Bearer token',
        },
        'authorization',
      )
      .setTitle('ERP-COIN-SYSTEM')
      .setDescription(
        'A platform that allows students to earn coins and gain knowledge',
      )
      .setVersion('1.0.0')
      .addTag('Nestjs, Prisma, Validation')
      .build(),
  );
  SwaggerModule.setup('/api/docs', app, document);
}

async function start() {
  // .env AppModule import qilinganda tekshiriladi (validateEnv) — bu yerga faqat
  // to'g'ri konfiguratsiya bilan yetib kelinadi
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });
  const config = app.get<AppConfig>(ConfigService);
  const isProd = config.get('NODE_ENV', { infer: true }) === 'production';
  const port = config.get('PORT', { infer: true }) ?? 3001;

  // Loglar: production'da JSON (log yig'uvchi uchun), har bir qatorda so'rov ID'si
  app.useLogger(new AppLogger({ json: isProd }));

  // SIGTERM/SIGINT (deploy, restart) — onModuleDestroy hook'lari ishlaydi, DB ulanishlari yopiladi
  app.enableShutdownHooks();

  // Reverse proxy (nginx) ortida haqiqiy klient IP'si X-Forwarded-For dan olinadi.
  // Aks holda throttler barcha so'rovlarni bitta (proxy) IP deb hisoblaydi.
  // Masalan: TRUST_PROXY=1 (bitta proxy). Proxy bo'lmasa — bermang.
  const trustProxy = config.get('TRUST_PROXY', { infer: true });
  if (trustProxy) {
    const hops = Number(trustProxy);
    app.set('trust proxy', Number.isNaN(hops) ? trustProxy : hops);
  }

  // Har bir so'rovga ID (javob header'i, xato javobi va loglarda) — eng birinchi
  app.use(requestIdMiddleware);

  // cookie-parser
  app.use(cookieParser());

  // avatar rasmlari uchun statik fayl servisi.
  // nosniff + qat'iy CSP: fayl qandaydir yo'l bilan HTML/SVG bo'lib qolsa ham brauzer uni skript sifatida ishga tushirmaydi
  app.use(
    '/uploads',
    express.static(UPLOADS_ROOT, {
      dotfiles: 'deny',
      index: false,
      setHeaders: (res) => {
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader(
          'Content-Security-Policy',
          "default-src 'none'; img-src 'self'; sandbox",
        );
        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      },
    }),
  );

  // Yagona xato formati (HTTP, Prisma, kutilmagan xatolar) — stack faqat logda
  app.useGlobalFilters(new AllExceptionsFilter());

  // global validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // DTOda bo'lmagan fieldlarni o'chiradi
      forbidNonWhitelisted: true, // noma'lum field kelsa xato beradi
      transform: true,
    }),
  );

  // global prefix
  app.setGlobalPrefix('/api');

  // helmet
  app.use(helmet());

  // CORS — production'da faqat FRONTEND_DOMEN (env validatsiyasida majburiy)
  const frontend = config.get('FRONTEND_DOMEN', { infer: true });
  const allowedOrigins: string[] = isProd ? [] : [...DEV_ORIGINS];
  if (frontend) allowedOrigins.push(frontend);

  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      // Origin'siz so'rovlar (server-server, curl) — CORS ularga taalluqli emas.
      // Ruxsatsiz origin'ga CORS header'lari qo'yilmaydi, brauzer javobni bloklaydi.
      callback(null, !origin || allowedOrigins.includes(origin));
    },
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
    // Frontend o'qiy oladigan header'lar: takroriy so'rovga saqlangan javob, so'rov ID'si
    exposedHeaders: [IDEMPOTENCY_REPLAYED_HEADER, REQUEST_ID_HEADER],
  });

  // swagger
  setupSwagger(app, config, isProd);

  // listen app
  await app.listen(port, () => logger.log(`🚀 Server running at port ${port}`));
}

start().catch((err) => {
  console.error('❌ Server startup error:', err);
  process.exit(1);
});

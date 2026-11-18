import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger, ValidationPipe } from '@nestjs/common';
import * as cookieParser from 'cookie-parser';
import * as basicAuth from 'express-basic-auth';
import { Handler } from 'express';
import helmet from 'helmet';
import * as express from 'express';
import { PrismaExceptionFilter } from './common/filters/prisma-exception.filter';
import { UPLOADS_ROOT } from './common/utils/image-upload';

const logger = new Logger('Bootstrap');

// Frontend dev serverlari — faqat production bo'lmagan muhitda ruxsat etiladi
const DEV_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:3000',
];

function setupSwagger(app: NestExpressApplication, isProd: boolean) {
  // Production'da Swagger faqat SWAGGER_ENABLED=true bo'lsa ochiladi
  if (isProd && process.env.SWAGGER_ENABLED !== 'true') return;

  let user = process.env.SWAGGER_USER;
  let password = process.env.SWAGGER_PASSWORD;

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

  const config = new DocumentBuilder()
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
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('/api/docs', app, document);
}

async function start() {
  // port
  const PORT = process.env.PORT || 3001;
  const isProd = process.env.NODE_ENV === 'production';

  // app
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // SIGTERM/SIGINT (deploy, restart) — onModuleDestroy hook'lari ishlaydi, DB ulanishlari yopiladi
  app.enableShutdownHooks();

  // Reverse proxy (nginx) ortida haqiqiy klient IP'si X-Forwarded-For dan olinadi.
  // Aks holda throttler barcha so'rovlarni bitta (proxy) IP deb hisoblaydi.
  // Masalan: TRUST_PROXY=1 (bitta proxy). Proxy bo'lmasa — bermang.
  if (process.env.TRUST_PROXY) {
    const hops = Number(process.env.TRUST_PROXY);
    app.set('trust proxy', Number.isNaN(hops) ? process.env.TRUST_PROXY : hops);
  }

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

  // global prisma exception filter
  app.useGlobalFilters(new PrismaExceptionFilter());

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

  // CORS — production'da faqat FRONTEND_DOMEN
  const allowedOrigins: string[] = isProd ? [] : [...DEV_ORIGINS];
  if (process.env.FRONTEND_DOMEN) {
    allowedOrigins.push(process.env.FRONTEND_DOMEN);
  }
  if (isProd && !allowedOrigins.length) {
    logger.warn(
      "FRONTEND_DOMEN berilmagan — production'da brauzerdan hech qanday origin'ga ruxsat yo'q",
    );
  }
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
  });

  // swagger
  setupSwagger(app, isProd);

  // listen app
  await app.listen(PORT, () => logger.log(`🚀 Server running at port ${PORT}`));
}

start().catch((err) => {
  console.error('❌ Server startup error:', err);
  process.exit(1);
});

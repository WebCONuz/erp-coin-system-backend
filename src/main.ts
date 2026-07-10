import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import * as cookieParser from 'cookie-parser';
import * as basicAuth from 'express-basic-auth';
import { Handler } from 'express';
import helmet from 'helmet';
import { join } from 'path';
import * as express from 'express';

async function start() {
  // port
  const PORT = process.env.PORT || 3001;

  // app
  const app = await NestFactory.create(AppModule);

  // cookie-parser
  app.use(cookieParser());

  // avatar rasmlari uchun statik fayl servisi
  app.use('/uploads', express.static(join(process.cwd(), 'uploads')));

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

  // CORS
  const allowedOrigins: string[] = [
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:3000',
  ];
  if (process.env.FRONTEND_DOMEN) {
    allowedOrigins.push(process.env.FRONTEND_DOMEN);
  }
  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new BadRequestException('Not allowed by CORS'));
      }
    },
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
  });

  // swagger auth
  const authMiddleware = basicAuth as unknown as (options: unknown) => Handler;
  app.use(
    ['/api/docs'],
    authMiddleware({
      users: { kottaAdmin: '12345' },
      challenge: true,
    }),
  );

  // swagger
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

  // listen app
  await app.listen(PORT, () =>
    console.log(`🚀 Server running at port ${PORT}`),
  );
}

start().catch((err) => {
  console.error('❌ Server startup error:', err);
  process.exit(1);
});

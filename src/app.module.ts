import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { MailModule } from './mail/mail.module';
import { TenantModule } from './tenant/tenant.module';
import { RewardCategoryModule } from './reward-category/reward-category.module';

@Module({
  imports: [
    ThrottlerModule.forRoot([
      {
        name: 'short',
        ttl: 1000, // 1 sekund
        limit: 10, // 10 ta so'rov
      },
      {
        name: 'long',
        ttl: 60000, // 1 daqiqa
        limit: 100, // 100 ta so'rov
      },
    ]),
    ConfigModule.forRoot({ envFilePath: '.env', isGlobal: true }),
    PrismaModule,
    UsersModule,
    AuthModule,
    MailModule,
    TenantModule,
    RewardCategoryModule,
  ],
  controllers: [],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard, // global — hamma endpointga qo'llaniladi
    },
  ],
})
export class AppModule {}

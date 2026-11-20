import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { MailModule } from './mail/mail.module';
import { TenantModule } from './tenant/tenant.module';
import { RewardCategoryModule } from './reward-category/reward-category.module';
import { RolesModule } from './roles/roles.module';
import { CoursesModule } from './courses/courses.module';
import { SubjectsModule } from './subjects/subjects.module';
import { RoomsModule } from './rooms/rooms.module';
import { GroupsModule } from './groups/groups.module';
import { RewardsModule } from './rewards/rewards.module';
import { CoinRulesModule } from './coin-rules/coin-rules.module';
import { CoinTransactionsModule } from './coin-transaction/coin-transaction.module';
import { SessionsModule } from './sessions/sessions.module';
import { PurchasesModule } from './purchases/purchases.module';
import { StudentsModule } from './students/students.module';
import { TeachersModule } from './teachers/teachers.module';
import { MessagesModule } from './messages/messages.module';
import { ScheduleModule } from './schedule/schedule.module';
import { AuditLogModule } from './audit-log/audit-log.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { AUTH_THROTTLER } from './auth/throttle/auth-throttle';
import { HealthModule } from './health/health.module';
import { RequestContextInterceptor } from './common/interceptors/request-context.interceptor';
import { validateEnv } from './config/env.validation';

@Module({
  imports: [
    ThrottlerModule.forRoot({
      throttlers: [
        {
          name: 'short',
          ttl: 1000,
          limit: 10,
        },
        {
          name: 'long',
          ttl: 60000,
          limit: 100,
        },
        // Faqat @AuthThrottle() qo'yilgan endpointlarda, username bo'yicha
        AUTH_THROTTLER,
      ],
      errorMessage: "Juda ko'p urinish. Birozdan keyin qayta urinib ko'ring",
    }),
    // .env server ishga tushishida tekshiriladi — xato bo'lsa server ishga tushmaydi
    ConfigModule.forRoot({
      envFilePath: '.env',
      isGlobal: true,
      validate: validateEnv,
    }),
    PrismaModule,
    UsersModule,
    AuthModule,
    MailModule,
    TenantModule,
    RewardCategoryModule,
    RolesModule,
    CoursesModule,
    SubjectsModule,
    RoomsModule,
    GroupsModule,
    RewardsModule,
    CoinRulesModule,
    CoinTransactionsModule,
    SessionsModule,
    PurchasesModule,
    StudentsModule,
    TeachersModule,
    MessagesModule,
    ScheduleModule,
    AuditLogModule,
    DashboardModule,
    HealthModule,
  ],
  controllers: [],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    // So'rov konteksti (IP, user-agent) — audit log uchun
    {
      provide: APP_INTERCEPTOR,
      useClass: RequestContextInterceptor,
    },
  ],
})
export class AppModule {}

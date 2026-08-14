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
import { RolesModule } from './roles/roles.module';
import { CoursesModule } from './courses/courses.module';
import { RoomsModule } from './rooms/rooms.module';
import { GroupsModule } from './groups/groups.module';
import { RewardsModule } from './rewards/rewards.module';
import { CoinRulesModule } from './coin-rules/coin-rules.module';
import { CoinTransactionsModule } from './coin-transaction/coin-transaction.module';
import { SessionsModule } from './sessions/sessions.module';
import { PurchasesModule } from './purchases/purchases.module';
import { StudentsModule } from './students/students.module';
import { MessagesModule } from './messages/messages.module';
import { ScheduleModule } from './schedule/schedule.module';
import { AuditLogModule } from './audit-log/audit-log.module';

@Module({
  imports: [
    ThrottlerModule.forRoot([
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
    ]),
    ConfigModule.forRoot({ envFilePath: '.env', isGlobal: true }),
    PrismaModule,
    UsersModule,
    AuthModule,
    MailModule,
    TenantModule,
    RewardCategoryModule,
    RolesModule,
    CoursesModule,
    RoomsModule,
    GroupsModule,
    RewardsModule,
    CoinRulesModule,
    CoinTransactionsModule,
    SessionsModule,
    PurchasesModule,
    StudentsModule,
    MessagesModule,
    ScheduleModule,
    AuditLogModule,
  ],
  controllers: [],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}

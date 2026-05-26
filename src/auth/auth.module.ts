import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { UsersModule } from '../users/users.module';
import { MailModule } from '../mail/mail.module';
import { TokenService } from './token.service';

@Module({
  imports: [
    PassportModule,
    JwtModule.register({}), // secret'lar strategy ichida ConfigService orqali olinadi
    UsersModule,
    MailModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, TokenService, JwtStrategy],
  exports: [TokenService, AuthService],
})
export class AuthModule {}

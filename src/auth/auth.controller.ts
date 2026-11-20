import {
  Controller,
  Post,
  Get,
  Body,
  Res,
  Req,
  HttpCode,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Response, Request } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { Public } from './decorators/public.decorator';
import { CurrentUser } from './decorators/current-user.decorator';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { AuthThrottle } from './throttle/auth-throttle';
import { ClientMeta } from 'src/common/types';

const refreshCookie = (req: Request) =>
  req.cookies?.refresh_token as string | undefined;

const clientMeta = (req: Request): ClientMeta => ({
  userAgent: req.headers['user-agent'],
  ipAddress: req.ip,
});

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Public()
  @AuthThrottle()
  @Post('login')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Tizimga kirish — har bir login alohida qurilma sessiyasi (boshqa qurilmalar chiqib ketmaydi)',
  })
  login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.authService.login(dto, res, clientMeta(req));
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  @ApiOperation({ summary: 'Access tokenni yangilash' })
  refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.authService.refresh(refreshCookie(req), res);
  }

  // Access token muddati o'tgan bo'lsa ham ishlaydi — refresh cookie bo'yicha joriy qurilma yopiladi
  @Public()
  @Post('logout')
  @HttpCode(200)
  @ApiOperation({ summary: 'Tizimdan chiqish (faqat joriy qurilma)' })
  logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.authService.logout(refreshCookie(req), res);
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout-all')
  @HttpCode(200)
  @ApiOperation({ summary: 'Barcha qurilmalardan chiqish' })
  logoutAll(
    @CurrentUser('id') userId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.authService.logoutAll(userId, res);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  @ApiOperation({ summary: "Joriy foydalanuvchi ma'lumotlari" })
  getMe(@CurrentUser('id') userId: string) {
    return this.authService.getMe(userId);
  }

  @Public()
  @AuthThrottle()
  @Post('forgot-password')
  @HttpCode(200)
  @ApiOperation({ summary: 'Parolni tiklash uchun email yuborish' })
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @Public()
  @AuthThrottle()
  @Post('reset-password')
  @HttpCode(200)
  @ApiOperation({ summary: "Yangi parol o'rnatish" })
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }
}

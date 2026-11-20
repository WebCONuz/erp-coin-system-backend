import { Controller, Post, Body, UseGuards, HttpCode } from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { MessagesService } from './messages.service';
import { SendMessageDto } from './dto/send-message.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import { TenantContext } from 'src/auth/decorators/tenant-context.decorator';
import { ReqUserType } from 'src/common/types';

@ApiTags('Messages')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('messages')
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  // Pullik tashqi servis (SMS) — global limitdan qat'iyroq: soniyada 1, daqiqada 20
  @Throttle({
    short: { limit: 1, ttl: 1000 },
    long: { limit: 20, ttl: 60_000 },
  })
  @Post('send')
  @Roles('admin', 'super_admin')
  @HttpCode(200)
  @ApiOperation({
    summary:
      "SMS va/yoki Email orqali xabar yuborish (admin va super_admin). Qabul qiluvchi ixtiyoriy raqam/email bo'lishi mumkin; har bir yuborish logga yoziladi",
  })
  @ApiResponse({ status: 200, description: 'Xabar yuborildi' })
  @ApiResponse({ status: 400, description: 'Validatsiya xatosi' })
  @ApiResponse({ status: 403, description: "Ruxsat yo'q" })
  @ApiResponse({ status: 429, description: "Juda ko'p so'rov" })
  send(
    @Body() dto: SendMessageDto,
    @TenantContext() tenantId: string,
    @CurrentUser() sender: ReqUserType,
  ) {
    return this.messagesService.send(dto, tenantId, sender);
  }
}

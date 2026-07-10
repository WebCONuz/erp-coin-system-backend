import { Controller, Post, Body, UseGuards, HttpCode } from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import { MessagesService } from './messages.service';
import { SendMessageDto } from './dto/send-message.dto';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';

@ApiTags('Messages')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('messages')
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  @Post('send')
  @Roles('admin', 'super_admin')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'SMS va/yoki Email orqali xabar yuborish (faqat admin va super_admin)',
  })
  @ApiResponse({ status: 200, description: 'Xabar yuborildi' })
  @ApiResponse({ status: 400, description: 'Validatsiya xatosi' })
  @ApiResponse({ status: 403, description: "Ruxsat yo'q" })
  send(
    @Body() dto: SendMessageDto,
    @CurrentUser('fullName') senderFullName: string,
  ) {
    return this.messagesService.send(dto, senderFullName);
  }
}

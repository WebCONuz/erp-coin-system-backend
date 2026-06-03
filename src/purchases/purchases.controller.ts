import {
  Controller,
  Get,
  Body,
  Patch,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { PurchasesService } from './purchases.service';
import { QueryPurchaseDto } from './dto/query-purchase.dto';
import { UpdatePurchaseStatusDto } from './dto/update-purchase-status.dto';
import { TenantContext } from 'src/auth/decorators/tenant-context.decorator';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';

@ApiTags('Geymifikatsiya: Xaridlar va Buyurtmalar')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('purchases')
export class PurchasesController {
  constructor(private readonly purchasesService: PurchasesService) {}

  @Get()
  @ApiOperation({
    summary:
      'Barcha xaridlar/buyurtmalar tarixini ko‘rish (Admin va Talabalar uchun)',
  })
  findAll(
    @TenantContext() tenantId: string,
    @Query() query: QueryPurchaseDto,
    @CurrentUser('id') currentUserId: string,
    @CurrentUser('role') role: string,
  ) {
    // Agar so‘rov yuborgan foydalanuvchi talaba bo‘lsa, u faqat o‘zining xaridlarini ko‘ra oladi
    if (role === 'student') {
      query.studentId = currentUserId;
    }
    return this.purchasesService.findAll(query, tenantId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Xaridning batafsil tafsilotlarini ko‘rish' })
  @ApiParam({ name: 'id', format: 'uuid' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @TenantContext() tenantId: string,
  ) {
    return this.purchasesService.findOne(id, tenantId);
  }

  @Patch(':id/status')
  @ApiOperation({
    summary:
      'Xarid holatini o‘zgartirish: Tasdiqlash yoki Rad etish (Faqat Admin)',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @TenantContext() tenantId: string,
    @CurrentUser('id') adminId: string,
    @Body() dto: UpdatePurchaseStatusDto,
  ) {
    return this.purchasesService.updateStatus(id, tenantId, adminId, dto);
  }
}

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
import { Roles } from 'src/auth/decorators/roles.decorator';

@ApiTags('Geymifikatsiya: Xaridlar va Buyurtmalar')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('purchases')
export class PurchasesController {
  constructor(private readonly purchasesService: PurchasesService) {}

  @Get()
  @ApiOperation({
    summary:
      'Xaridlar ro‘yxati (Admin — tenantdagi barchasi, Talaba — faqat o‘ziniki; Teacher — ruxsat yo‘q)',
  })
  findAll(
    @TenantContext() tenantId: string,
    @Query() query: QueryPurchaseDto,
    @CurrentUser('id') currentUserId: string,
    @CurrentUser('role') role: string,
  ) {
    return this.purchasesService.findAll(query, tenantId, role, currentUserId);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Xaridning batafsil tafsilotlari (Teacher — ruxsat yo‘q)',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @TenantContext() tenantId: string,
    @CurrentUser('role') role: string,
    @CurrentUser('id') currentUserId: string,
  ) {
    return this.purchasesService.findOne(id, tenantId, role, currentUserId);
  }

  @Patch(':id/status')
  @Roles('admin', 'super_admin')
  @ApiOperation({
    summary:
      'Xarid holatini o‘zgartirish: pending→approved→delivered yoki cancelled (coin qaytadi). Faqat Admin',
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

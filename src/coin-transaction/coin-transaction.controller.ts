import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
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
import { CoinTransactionsService } from './coin-transaction.service';
import { CreateCoinTransactionDto } from './dto/create-coin-transaction.dto';
import { QueryCoinTransactionDto } from './dto/query-coin-transaction.dto';
import { QueryMyCoinHistoryDto } from './dto/query-my-coin-history.dto';
import { QueryCoinStatsDto } from './dto/query-coin-stats.dto';
import { TenantContext } from 'src/auth/decorators/tenant-context.decorator';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';
import { Roles } from 'src/auth/decorators/roles.decorator';

@ApiTags('Geymifikatsiya: Tanga Tranzaksiyalari va Hamyon')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('coin-transactions')
export class CoinTransactionsController {
  constructor(
    private readonly coinTransactionsService: CoinTransactionsService,
  ) {}

  @Post('manual')
  @Roles('admin', 'super_admin', 'teacher')
  @ApiOperation({
    summary: 'Talabaga qo‘lda coin berish yoki chegirish (Admin / O‘qituvchi)',
  })
  createManual(
    @TenantContext() tenantId: string,
    @CurrentUser('id') teacherId: string,
    @Body() dto: CreateCoinTransactionDto,
  ) {
    return this.coinTransactionsService.createManualTransaction(
      tenantId,
      teacherId,
      dto,
    );
  }

  @Get('history')
  @Roles('admin', 'super_admin', 'teacher')
  @ApiOperation({
    summary:
      'Tranzaksiyalar tarixini ko‘rish (Filtrlar bilan) — faqat xodimlar uchun',
  })
  findAll(
    @TenantContext() tenantId: string,
    @Query() query: QueryCoinTransactionDto,
  ) {
    return this.coinTransactionsService.findAll(query, tenantId);
  }

  @Delete(':id/cancel')
  @Roles('admin', 'super_admin')
  @ApiOperation({
    summary: 'Tranzaksiyani bekor qilish (Soft-Delete va balansni qaytarish)',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  cancelTransaction(
    @Param('id', ParseUUIDPipe) id: string,
    @TenantContext() tenantId: string,
  ) {
    return this.coinTransactionsService.cancelTransaction(id, tenantId);
  }

  // 💳 WALLET READ ENDPOINTS
  @Get('my-wallet')
  @ApiOperation({
    summary: 'Tizimga kirgan talabaning o‘z hamyon balansini ko‘rishi',
  })
  getMyWallet(
    @TenantContext() tenantId: string,
    @CurrentUser('id') studentId: string,
  ) {
    return this.coinTransactionsService.getStudentWallet(studentId, tenantId);
  }

  @Get('my-history')
  @ApiOperation({
    summary:
      "Tizimga kirgan talabaning o'z tanga tranzaksiyalari tarixi (pagination, sana/tur filtrlari bilan)",
  })
  getMyHistory(
    @TenantContext() tenantId: string,
    @CurrentUser('id') studentId: string,
    @Query() query: QueryMyCoinHistoryDto,
  ) {
    return this.coinTransactionsService.getMyHistory(
      studentId,
      tenantId,
      query,
    );
  }

  @Get('my-stats')
  @ApiOperation({
    summary:
      'Talabaning tanga statistikasi (chart uchun): earn/deduct trend, haftalik yoki oylik',
  })
  getMyStats(
    @TenantContext() tenantId: string,
    @CurrentUser('id') studentId: string,
    @Query() query: QueryCoinStatsDto,
  ) {
    return this.coinTransactionsService.getMyStats(studentId, tenantId, query);
  }

  @Get('leaderboard')
  @ApiOperation({
    summary: 'Eng ko‘p tangaga ega talabalar reytingi (Leaderboard)',
  })
  getLeaderboard(
    @TenantContext() tenantId: string,
    @Query('limit') limit?: number,
  ) {
    return this.coinTransactionsService.getLeaderboard(
      tenantId,
      limit ? Number(limit) : 10,
    );
  }
}

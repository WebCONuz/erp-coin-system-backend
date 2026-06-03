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
import { TenantContext } from 'src/auth/decorators/tenant-context.decorator';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/auth/guards/roles.guard';

@ApiTags('Geymifikatsiya: Tanga Tranzaksiyalari va Hamyon')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('coin-transactions')
export class CoinTransactionsController {
  constructor(
    private readonly coinTransactionsService: CoinTransactionsService,
  ) {}

  @Post('manual')
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
  @ApiOperation({ summary: 'Tranzaksiyalar tarixini ko‘rish (Filtrlar bilan)' })
  findAll(
    @TenantContext() tenantId: string,
    @Query() query: QueryCoinTransactionDto,
  ) {
    return this.coinTransactionsService.findAll(query, tenantId);
  }

  @Delete(':id/cancel')
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

import { Module } from '@nestjs/common';
import { PurchasesController } from './purchases.controller';
import { PurchasesService } from './purchases.service';
import { CoinTransactionsModule } from 'src/coin-transaction/coin-transaction.module';

@Module({
  imports: [CoinTransactionsModule],
  controllers: [PurchasesController],
  providers: [PurchasesService],
  exports: [PurchasesService],
})
export class PurchasesModule {}

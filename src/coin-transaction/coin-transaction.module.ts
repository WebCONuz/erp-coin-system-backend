import { Module } from '@nestjs/common';
import { CoinTransactionsController } from './coin-transaction.controller';
import { CoinTransactionsService } from './coin-transaction.service';

@Module({
  controllers: [CoinTransactionsController],
  providers: [CoinTransactionsService],
  exports: [CoinTransactionsService],
})
export class CoinTransactionsModule {}

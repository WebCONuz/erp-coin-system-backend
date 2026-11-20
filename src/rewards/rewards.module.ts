import { Module } from '@nestjs/common';
import { RewardsController } from './rewards.controller';
import { RewardsService } from './rewards.service';
import { CoinTransactionsModule } from 'src/coin-transaction/coin-transaction.module';

@Module({
  // Xarid hamyonni CoinTransactionsService.lockWallet() bilan qulflaydi
  imports: [CoinTransactionsModule],
  controllers: [RewardsController],
  providers: [RewardsService],
  exports: [RewardsService],
})
export class RewardsModule {}

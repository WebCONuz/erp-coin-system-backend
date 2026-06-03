import { Module } from '@nestjs/common';
import { SessionsController } from './sessions.controller';
import { SessionsService } from './sessions.service';
import { CoinTransactionsModule } from 'src/coin-transaction/coin-transaction.module';

@Module({
  imports: [CoinTransactionsModule],
  controllers: [SessionsController],
  providers: [SessionsService],
  exports: [SessionsService],
})
export class SessionsModule {}

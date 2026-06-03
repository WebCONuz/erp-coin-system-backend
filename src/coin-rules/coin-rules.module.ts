import { Module } from '@nestjs/common';
import { CoinRulesController } from './coin-rules.controller';
import { CoinRulesService } from './coin-rules.service';

@Module({
  controllers: [CoinRulesController],
  providers: [CoinRulesService],
  exports: [CoinRulesService],
})
export class CoinRulesModule {}

import { Module } from '@nestjs/common';
import { RewardCategoryService } from './reward-category.service';
import { RewardCategoryController } from './reward-category.controller';

@Module({
  controllers: [RewardCategoryController],
  providers: [RewardCategoryService],
  exports: [RewardCategoryService],
})
export class RewardCategoryModule {}

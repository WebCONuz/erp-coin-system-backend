import { Module } from '@nestjs/common';
import {
  ScheduleController,
  ScheduleExceptionController,
} from './schedule.controller';
import { ScheduleService } from './schedule.service';

@Module({
  controllers: [ScheduleController, ScheduleExceptionController],
  providers: [ScheduleService],
  exports: [ScheduleService],
})
export class ScheduleModule {}

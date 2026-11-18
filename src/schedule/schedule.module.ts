import { Module } from '@nestjs/common';
import {
  ScheduleController,
  ScheduleExceptionController,
} from './schedule.controller';
import { ScheduleService } from './schedule.service';
import { HolidaysController } from './holidays.controller';
import { HolidaysService } from './holidays.service';

@Module({
  controllers: [
    ScheduleController,
    ScheduleExceptionController,
    HolidaysController,
  ],
  providers: [ScheduleService, HolidaysService],
  exports: [ScheduleService],
})
export class ScheduleModule {}

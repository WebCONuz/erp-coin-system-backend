import { Module } from '@nestjs/common';
import { RoomsController } from './rooms.controller';
import { RoomsService } from './rooms.service';

@Module({
  controllers: [RoomsController],
  providers: [RoomsService],
  exports: [RoomsService], // Agar keyinchalik Guruhlar (Groups) modulida xona borligini tekshirish kerak bo'lsa, export qilib qo'yamiz
})
export class RoomsModule {}

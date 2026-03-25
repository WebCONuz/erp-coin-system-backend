import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Global() // barcha modullar import qilmasdan ishlatishi uchun
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}

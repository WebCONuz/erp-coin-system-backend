import {
  Controller,
  Get,
  HttpCode,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PrismaService } from 'src/prisma/prisma.service';

// Load balancer / monitoring / docker healthcheck uchun ochiq endpoint (auth talab qilinmaydi).
// Ichki ma'lumot (versiya, ulanish satri va h.k.) qaytarilmaydi.
@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @HttpCode(200)
  @ApiOperation({
    summary: 'Server va DB holati (200 — ishlayapti, 503 — DB ishlamayapti)',
  })
  async check() {
    const startedAt = Date.now();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new ServiceUnavailableException({
        status: 'error',
        db: 'down',
      });
    }
    return {
      status: 'ok',
      db: 'up',
      dbLatencyMs: Date.now() - startedAt,
      uptimeSeconds: Math.round(process.uptime()),
    };
  }
}

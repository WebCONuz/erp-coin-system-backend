import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  constructor(private prisma: PrismaService) {}

  async use(req: Request, res: Response, next: NextFunction) {
    const user = (req as any).user;

    if (user?.tenantId) {
      await this.prisma.$executeRawUnsafe(
        `SET LOCAL app.current_tenant_id = '${user.tenantId}'`,
      );
    }

    next();
  }
}

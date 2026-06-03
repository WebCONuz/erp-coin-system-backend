import { Injectable, NestMiddleware } from '@nestjs/common';
import { Response, NextFunction } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { RequestWithUser } from '../types';

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  constructor(private prisma: PrismaService) {}

  async use(req: RequestWithUser, res: Response, next: NextFunction) {
    const user = req.user;

    if (user?.tenantId) {
      await this.prisma.$executeRawUnsafe(
        `SET LOCAL app.current_tenant_id = '${user.tenantId}'`,
      );
    }

    next();
  }
}

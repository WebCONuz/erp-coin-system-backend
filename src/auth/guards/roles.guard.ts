import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles || requiredRoles.length === 0) return true;

    const { user } = context.switchToHttp().getRequest();
    if (!user) return false;

    const userRole = await this.prisma.role.findUnique({
      where: { id: user.roleId },
      select: { level: true, name: true },
    });

    if (!userRole) return false;

    const requiredLevels = await this.prisma.role.findMany({
      where: { name: { in: requiredRoles } },
      select: { level: true },
    });

    const minRequired = Math.min(...requiredLevels.map((r) => r.level));

    if (userRole.level < minRequired) {
      throw new ForbiddenException(
        `Bu amalni bajarish uchun ${requiredRoles.join(' yoki ')} huquqi kerak`,
      );
    }

    return true;
  }
}

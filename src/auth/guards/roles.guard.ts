import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { PrismaService } from 'src/prisma/prisma.service';
import { AuthPayloadType } from 'src/common/types';

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

    const request = context
      .switchToHttp()
      .getRequest<{ user?: AuthPayloadType }>();
    const user = request.user;
    if (!user) return false;

    // Foydalanuvchining rolini bazadan tekshiramiz
    const userRole = await this.prisma.role.findUnique({
      where: { id: user.roleId },
      select: { level: true, name: true },
    });

    if (!userRole) return false;

    // Talab qilingan rollarni darajasini (level) olamiz
    const requiredLevels = await this.prisma.role.findMany({
      where: { name: { in: requiredRoles } },
      select: { level: true },
    });

    if (requiredLevels.length === 0) return false;

    const minRequired = Math.min(...requiredLevels.map((r) => r.level));

    if (userRole.level < minRequired) {
      throw new ForbiddenException(
        `Bu amalni bajarish uchun ${requiredRoles.join(' yoki ')} huquqi kerak`,
      );
    }

    return true;
  }
}

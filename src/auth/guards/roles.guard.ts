import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { ReqUserType } from 'src/common/types';
import { ROLE_LEVELS } from 'src/roles/constants';

/**
 * Rol nomini emas, darajasini (level) tekshiradi: talab qilingan rollarning eng kichik
 * levelidan yuqori yoki teng har qanday rol kira oladi.
 *
 * DB'ga murojaat qilinmaydi: userning joriy levelini JwtStrategy har bir so'rovda DB'dan
 * (rol bilan birga) o'qib `req.user.roleLevel` ga yozadi; talab qilingan rollar darajasi —
 * ROLE_LEVELS konstantasidan (level barcha tenantlarda bir xil).
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles || requiredRoles.length === 0) return true;

    const request = context.switchToHttp().getRequest<{ user?: ReqUserType }>();
    const user = request.user;
    if (!user || typeof user.roleLevel !== 'number') return false;

    const requiredLevels = requiredRoles
      .map((name) => ROLE_LEVELS[name])
      .filter((level): level is number => level !== undefined);

    // Noma'lum rol nomi — dasturchi xatosi; xavfsiz tomonga: ruxsat yo'q
    if (requiredLevels.length === 0) return false;

    const minRequired = Math.min(...requiredLevels);

    if (user.roleLevel < minRequired) {
      throw new ForbiddenException(
        `Bu amalni bajarish uchun ${requiredRoles.join(' yoki ')} huquqi kerak`,
      );
    }

    return true;
  }
}

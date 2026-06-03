import {
  createParamDecorator,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { RequestWithUser } from 'src/common/types';

const ELEVATED_ROLES = ['super_admin', 'creator'];

export const TenantContext = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest<RequestWithUser>();
    const user = request.user;

    if (ELEVATED_ROLES.includes(user.role)) {
      // super_admin va creator: param yoki query dan oladi
      const tenantId = request.params?.tenantId ?? request.query?.tenantId;
      if (!tenantId) {
        throw new ForbiddenException(
          "super_admin uchun tenantId params yoki query da bo'lishi kerak",
        );
      }
      return Array.isArray(tenantId) ? tenantId[0] : tenantId;
    }

    // admin, teacher, student: tokendan oladi
    return user.tenantId;
  },
);

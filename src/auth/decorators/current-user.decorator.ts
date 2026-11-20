import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { ReqUserType, RequestWithUser } from 'src/common/types';

// @CurrentUser() — butun req.user; @CurrentUser('id') — bitta maydon (nomi tip bilan tekshiriladi)
export const CurrentUser = createParamDecorator(
  (data: keyof ReqUserType | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<RequestWithUser>();
    const user = request.user;

    if (data && user) {
      return user[data];
    }
    return user;
  },
);

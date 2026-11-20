import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { requestContext } from '../context/request-context';
import { RequestWithId } from '../middleware/request-id.middleware';

/**
 * Har bir HTTP so'rov handler'ini AsyncLocalStorage konteksti ichida ishga tushiradi.
 * Express middleware emas, interceptor — body-parser stream hodisalarida ALS konteksti
 * yo'qoladi, interceptor esa body o'qilgandan keyin, handler chaqirilishidan oldin ishlaydi.
 */
@Injectable()
export class RequestContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const req = context.switchToHttp().getRequest<RequestWithId>();
    const store = {
      requestId: req.id,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    };

    return new Observable((subscriber) =>
      requestContext.run(store, () => next.handle().subscribe(subscriber)),
    );
  }
}

import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { Prisma } from 'src/generated/prisma/client';
import { RequestWithId } from '../middleware/request-id.middleware';
import { mapPrismaKnownError, PRISMA_ERROR_CODES } from './prisma-error';

// 400 → "Bad Request" (Nest standart javobidagi `error` maydoni bilan bir xil)
export function reasonPhrase(status: number): string {
  const key = HttpStatus[status] as string | undefined;
  if (!key) return 'Error';
  return key
    .toLowerCase()
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/**
 * Yagona xato javobi: `{ statusCode, error, message, code?, ...qo'shimcha, path, requestId }`.
 * - HttpException — mavjud javob obyekti saqlanadi (`code`, `conflict`, `studentIds` kabi
 *   maydonlarga frontend tayanadi), faqat `path` va `requestId` qo'shiladi.
 * - Prisma xatolari — tushunarli xabar, ichki tafsilot (SQL, ustunlar) faqat logda.
 * - Boshqa (kutilmagan) xatolar — 500, stack faqat logda.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<RequestWithId>();
    const meta = { path: req.originalUrl, requestId: req.id };
    const where = `${req.method} ${req.originalUrl} [req ${req.id ?? '-'}]`;

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      if (status >= 500) {
        this.logger.error(`${where} ${exception.message}`, exception.stack);
      }
      return res.status(status).json({
        statusCode: status,
        error: reasonPhrase(status),
        ...(typeof body === 'object' && body !== null
          ? body
          : { message: body }),
        ...meta,
      });
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      const mapped = mapPrismaKnownError(exception.code, exception.meta);
      const log = `${where} Prisma ${exception.code}: ${exception.message}`;
      if (mapped.status >= 500) this.logger.error(log);
      else this.logger.warn(log);
      return res.status(mapped.status).json({
        statusCode: mapped.status,
        error: reasonPhrase(mapped.status),
        message: mapped.message,
        code: mapped.code,
        ...(mapped.fields ? { fields: mapped.fields } : {}),
        ...meta,
      });
    }

    if (exception instanceof Prisma.PrismaClientValidationError) {
      this.logger.warn(`${where} PrismaValidationError: ${exception.message}`);
      return res.status(HttpStatus.BAD_REQUEST).json({
        statusCode: HttpStatus.BAD_REQUEST,
        error: reasonPhrase(HttpStatus.BAD_REQUEST),
        message: "So'rov ma'lumotlari noto'g'ri formatda",
        ...meta,
      });
    }

    if (exception instanceof Prisma.PrismaClientInitializationError) {
      this.logger.error(`${where} DB ulanmadi: ${exception.message}`);
      return res.status(HttpStatus.SERVICE_UNAVAILABLE).json({
        statusCode: HttpStatus.SERVICE_UNAVAILABLE,
        error: reasonPhrase(HttpStatus.SERVICE_UNAVAILABLE),
        message:
          "Ma'lumotlar bazasi vaqtincha javob bermayapti. Birozdan keyin qayta urinib ko'ring",
        code: PRISMA_ERROR_CODES.DB_UNAVAILABLE,
        ...meta,
      });
    }

    const err =
      exception instanceof Error ? exception : new Error(String(exception));
    this.logger.error(`${where} ${err.message}`, err.stack);
    return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      error: reasonPhrase(HttpStatus.INTERNAL_SERVER_ERROR),
      message: 'Serverda xatolik yuz berdi',
      ...meta,
    });
  }
}

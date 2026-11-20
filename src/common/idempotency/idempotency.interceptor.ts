import {
  CallHandler,
  ConflictException,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NestInterceptor,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { from, Observable, of } from 'rxjs';
import { catchError, mergeMap } from 'rxjs/operators';
import { PrismaService } from 'src/prisma/prisma.service';
import { Prisma } from 'src/generated/prisma/client';
import { ReqUserType } from 'src/common/types';
import {
  decideExistingKey,
  hashIdempotentRequest,
  IDEMPOTENCY_ERROR_CODES,
  IDEMPOTENCY_HEADER,
  IDEMPOTENCY_KEY_REGEX,
  IDEMPOTENCY_REPLAYED_HEADER,
  IDEMPOTENCY_TTL_MS,
} from './idempotency';

/**
 * `Idempotency-Key` header'i majburiy bo'lgan endpointlar uchun (`@Idempotent()`):
 * 1. Kalit (user bo'yicha noyob) "bajarilmoqda" holatida band qilinadi.
 * 2. Shu kalit bilan takroriy so'rov: avvalgisi tugagan bo'lsa — saqlangan javob qaytadi
 *    (`Idempotent-Replayed: true`), amal qayta bajarilmaydi; hali tugamagan bo'lsa — 409;
 *    kalit boshqa mazmundagi so'rov uchun ishlatilgan bo'lsa — 422.
 * 3. Muvaffaqiyatli javob saqlanadi; xato bo'lsa kalit bo'shatiladi (shu kalit bilan qayta urinish mumkin).
 *
 * Xavfsiz tomonga: amal bajarilib, javobni saqlash muvaffaqiyatsiz bo'lsa, kalit "bajarilmoqda"
 * bo'lib qoladi — takroriy so'rov 409 oladi, lekin amal ikki marta bajarilmaydi.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  private readonly logger = new Logger(IdempotencyInterceptor.name);

  constructor(private readonly prisma: PrismaService) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    const http = context.switchToHttp();
    const req = http.getRequest<Request & { user?: ReqUserType }>();
    const res = http.getResponse<Response>();
    const user = req.user;
    // Guard'lar interceptor'dan oldin ishlaydi — bu yerga faqat tizimga kirgan user keladi
    if (!user) return next.handle();

    const key = this.readKey(req);
    const requestHash = hashIdempotentRequest(
      req.method,
      req.originalUrl,
      req.body,
    );
    const scope = { tenantId: user.tenantId, userId: user.id, key };

    // Muddati o'tgan kalitlar (shu user) — arzon, noyob indeks prefiksi bo'yicha
    await this.prisma.idempotencyKey.deleteMany({
      where: {
        tenantId: user.tenantId,
        userId: user.id,
        expiresAt: { lte: new Date() },
      },
    });

    const { count } = await this.prisma.idempotencyKey.createMany({
      data: [
        {
          ...scope,
          requestHash,
          expiresAt: new Date(Date.now() + IDEMPOTENCY_TTL_MS),
        },
      ],
      skipDuplicates: true,
    });

    if (count === 0) {
      const existing = await this.prisma.idempotencyKey.findUnique({
        where: { tenantId_userId_key: scope },
        select: { requestHash: true, statusCode: true, response: true },
      });
      // Shu orada muddati o'tib o'chirilgan bo'lsa — kamdan-kam holat, qayta urinish so'raladi
      if (!existing) throw this.inProgress();

      const decision = decideExistingKey(existing, requestHash);
      if (decision.kind === 'reused') {
        throw new UnprocessableEntityException({
          statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
          message:
            "Bu Idempotency-Key boshqa so'rov uchun ishlatilgan. Har bir yangi amal uchun yangi kalit yuboring",
          code: IDEMPOTENCY_ERROR_CODES.REUSED,
        });
      }
      if (decision.kind === 'in_progress') throw this.inProgress();

      res.status(decision.statusCode);
      res.setHeader(IDEMPOTENCY_REPLAYED_HEADER, 'true');
      return of(decision.response);
    }

    return next.handle().pipe(
      mergeMap((body: unknown) =>
        from(this.complete(scope, res.statusCode, body).then(() => body)),
      ),
      catchError((err: unknown) =>
        from(
          this.release(scope).then(() => {
            throw err;
          }),
        ),
      ),
    );
  }

  private readKey(req: Request): string {
    const raw = req.headers[IDEMPOTENCY_HEADER];
    const key = Array.isArray(raw) ? raw[0] : raw;
    if (!key) {
      throw new HttpException(
        {
          statusCode: HttpStatus.BAD_REQUEST,
          message:
            "Idempotency-Key header'i majburiy (har bir yangi amal uchun noyob qiymat, masalan UUID)",
          code: IDEMPOTENCY_ERROR_CODES.REQUIRED,
        },
        HttpStatus.BAD_REQUEST,
      );
    }
    if (!IDEMPOTENCY_KEY_REGEX.test(key)) {
      throw new HttpException(
        {
          statusCode: HttpStatus.BAD_REQUEST,
          message:
            "Idempotency-Key 8–100 belgidan iborat bo'lishi kerak: lotin harflari, raqamlar, '-' va '_'",
          code: IDEMPOTENCY_ERROR_CODES.INVALID,
        },
        HttpStatus.BAD_REQUEST,
      );
    }
    return key;
  }

  private inProgress() {
    return new ConflictException({
      statusCode: HttpStatus.CONFLICT,
      message:
        "Shu Idempotency-Key bilan so'rov hali bajarilmoqda. Birozdan keyin natijani tekshiring",
      code: IDEMPOTENCY_ERROR_CODES.IN_PROGRESS,
    });
  }

  private async complete(
    scope: { tenantId: string; userId: string; key: string },
    statusCode: number,
    body: unknown,
  ) {
    try {
      await this.prisma.idempotencyKey.update({
        where: { tenantId_userId_key: scope },
        data: {
          statusCode,
          response: (body ?? null) as Prisma.InputJsonValue,
        },
      });
    } catch (err) {
      // Amal allaqachon bajarilgan — klientga muvaffaqiyat qaytadi; kalit "bajarilmoqda" qoladi
      this.logger.error(
        `Idempotency javobi saqlanmadi [${scope.key}]: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // Amal bajarilmadi (xato) — shu kalit bilan qayta urinishga ruxsat
  private async release(scope: {
    tenantId: string;
    userId: string;
    key: string;
  }) {
    try {
      await this.prisma.idempotencyKey.deleteMany({
        where: { ...scope, statusCode: null },
      });
    } catch (err) {
      this.logger.error(
        `Idempotency kaliti bo'shatilmadi [${scope.key}]: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}

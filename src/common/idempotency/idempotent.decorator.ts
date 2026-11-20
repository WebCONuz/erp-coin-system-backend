import { applyDecorators, UseInterceptors } from '@nestjs/common';
import { ApiConflictResponse, ApiHeader } from '@nestjs/swagger';
import { IdempotencyInterceptor } from './idempotency.interceptor';

/**
 * Endpoint takroriy so'rovdan himoyalanadi: `Idempotency-Key` header'i majburiy.
 * Coin berish, xarid kabi ikki marta bajarilishi zarar keltiradigan amallar uchun.
 */
export function Idempotent() {
  return applyDecorators(
    UseInterceptors(IdempotencyInterceptor),
    ApiHeader({
      name: 'Idempotency-Key',
      required: true,
      description:
        "Har bir yangi amal uchun noyob qiymat (masalan UUID). Qayta urinishda (retry) o'sha qiymat yuboriladi — amal ikki marta bajarilmaydi, saqlangan javob qaytadi",
    }),
    ApiConflictResponse({
      description:
        "IDEMPOTENCY_REQUEST_IN_PROGRESS — shu kalit bilan so'rov hali bajarilmoqda",
    }),
  );
}

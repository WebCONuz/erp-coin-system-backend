import { SourceType } from 'src/generated/prisma/enums';

// Qo'lda (manual / bulk-manual) beriladigan coin manbalari.
// attendance/homework/exam/competition — sessiya tekshiruvi orqali avtomatik beriladi,
// purchase — faqat xarid moduli orqali; ularni qo'lda yozish taqiqlanadi.
export const MANUAL_SOURCE_TYPES = [
  SourceType.manual,
  SourceType.bonus,
] as const;

// Bitta qo'lda tranzaksiyadagi texnik yuqori chegara (Int overflow va xatolarga qarshi).
// Teacher uchun tenant sozlamasidagi limit alohida qo'llanadi.
export const MANUAL_COIN_HARD_MAX = 100_000;

// Izoh uzunligi
export const COIN_NOTE_MAX_LENGTH = 500;

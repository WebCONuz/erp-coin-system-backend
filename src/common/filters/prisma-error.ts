import { HttpStatus } from '@nestjs/common';

export interface MappedError {
  status: number;
  message: string;
  code: string;
  // Faqat API maydon nomlari (DB ustun nomlari klientga chiqmaydi)
  fields?: string[];
}

// Unique cheklovdagi maydon → foydalanuvchiga ko'rinadigan nom. `tenantId` kabi texnik
// maydonlar ko'rsatilmaydi. Ro'yxatda yo'q maydon nomi umuman qaytarilmaydi.
const UNIQUE_FIELD_LABELS: Record<string, string> = {
  username: 'Username',
  phone: 'Telefon raqam',
  slug: 'Slug',
  name: 'Nom',
  studentId: "O'quvchi",
  date: 'Sana',
  exceptionDate: 'Istisno sanasi',
  reversalOfId: 'Bekor qilish yozuvi',
};
const TECHNICAL_FIELDS = new Set(['tenantId', 'tenant_id', 'groupId']);

// P2002 meta'dan maydonlar: klassik `target: string[]` yoki driver adapter
// (`driverAdapterError.cause.constraint.fields`)
export function uniqueFields(meta: unknown): string[] {
  const m = (meta ?? {}) as {
    target?: unknown;
    driverAdapterError?: { cause?: { constraint?: { fields?: unknown } } };
  };
  const raw = Array.isArray(m.target)
    ? m.target
    : (m.driverAdapterError?.cause?.constraint?.fields ?? []);
  return Array.isArray(raw)
    ? raw.filter((f): f is string => typeof f === 'string')
    : [];
}

export const PRISMA_ERROR_CODES = {
  DUPLICATE: 'DUPLICATE_VALUE',
  NOT_FOUND: 'RECORD_NOT_FOUND',
  RELATION: 'RELATED_RECORD_CONSTRAINT',
  TOO_LONG: 'VALUE_TOO_LONG',
  CONFLICT_RETRY: 'CONCURRENT_UPDATE',
  DB_UNAVAILABLE: 'DATABASE_UNAVAILABLE',
  BAD_REQUEST: 'DATABASE_REQUEST_FAILED',
} as const;

/**
 * Prisma'ning ma'lum xato kodlarini (`PrismaClientKnownRequestError.code`) HTTP javobiga
 * aylantiradi. Ichki tafsilot (jadval/ustun nomlari, SQL) klientga chiqmaydi.
 */
export function mapPrismaKnownError(code: string, meta: unknown): MappedError {
  switch (code) {
    case 'P2002': {
      const fields = uniqueFields(meta).filter((f) => !TECHNICAL_FIELDS.has(f));
      const known = fields.filter((f) => UNIQUE_FIELD_LABELS[f]);
      return {
        status: HttpStatus.CONFLICT,
        message: known.length
          ? `${known.map((f) => UNIQUE_FIELD_LABELS[f]).join(', ')} allaqachon mavjud`
          : 'Bu qiymat allaqachon mavjud',
        code: PRISMA_ERROR_CODES.DUPLICATE,
        ...(known.length ? { fields: known } : {}),
      };
    }
    case 'P2025':
    case 'P2001':
      return {
        status: HttpStatus.NOT_FOUND,
        message: 'Yozuv topilmadi',
        code: PRISMA_ERROR_CODES.NOT_FOUND,
      };
    case 'P2003':
    case 'P2014':
      return {
        status: HttpStatus.CONFLICT,
        message:
          "Bog'liq yozuv topilmadi yoki bu yozuv boshqa ma'lumotlarda ishlatilmoqda",
        code: PRISMA_ERROR_CODES.RELATION,
      };
    case 'P2000':
      return {
        status: HttpStatus.BAD_REQUEST,
        message: 'Kiritilgan qiymat juda uzun',
        code: PRISMA_ERROR_CODES.TOO_LONG,
      };
    // Tranzaksiya to'qnashuvi / deadlock — qayta urinish mumkin
    case 'P2034':
      return {
        status: HttpStatus.CONFLICT,
        message:
          "Ma'lumot bir vaqtda boshqa so'rov tomonidan o'zgartirildi. Qayta urinib ko'ring",
        code: PRISMA_ERROR_CODES.CONFLICT_RETRY,
      };
    // Ulanish yo'q, pool band, tranzaksiya vaqti tugadi
    case 'P1001':
    case 'P1002':
    case 'P1008':
    case 'P1017':
    case 'P2024':
    case 'P2028':
      return {
        status: HttpStatus.SERVICE_UNAVAILABLE,
        message:
          "Ma'lumotlar bazasi vaqtincha javob bermayapti. Birozdan keyin qayta urinib ko'ring",
        code: PRISMA_ERROR_CODES.DB_UNAVAILABLE,
      };
    default:
      return {
        status: HttpStatus.BAD_REQUEST,
        message: "So'rovni bajarib bo'lmadi",
        code: PRISMA_ERROR_CODES.BAD_REQUEST,
      };
  }
}

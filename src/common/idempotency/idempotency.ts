import { createHash } from 'crypto';

// Klient har bir yangi amal uchun noyob kalit yuboradi (masalan crypto.randomUUID()),
// qayta urinishda (retry, ikki marta bosish) — o'sha kalitni
export const IDEMPOTENCY_HEADER = 'idempotency-key';
export const IDEMPOTENCY_REPLAYED_HEADER = 'Idempotent-Replayed';

// Saqlangan javob shu muddat ichida qaytariladi, keyin kalit tozalanadi
export const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

export const IDEMPOTENCY_KEY_REGEX = /^[A-Za-z0-9_-]{8,100}$/;

export const IDEMPOTENCY_ERROR_CODES = {
  REQUIRED: 'IDEMPOTENCY_KEY_REQUIRED',
  INVALID: 'IDEMPOTENCY_KEY_INVALID',
  REUSED: 'IDEMPOTENCY_KEY_REUSED',
  IN_PROGRESS: 'IDEMPOTENCY_REQUEST_IN_PROGRESS',
} as const;

// Kalitlar tartibidan qat'i nazar bir xil JSON (hash barqaror bo'lishi uchun)
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value) ?? 'null';
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries
    .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`)
    .join(',')}}`;
}

// So'rov mazmuni: method + URL (query bilan, masalan super_admin ?tenantId=) + body
export function hashIdempotentRequest(
  method: string,
  url: string,
  body: unknown,
): string {
  return createHash('sha256')
    .update(`${method.toUpperCase()} ${url}\n${stableStringify(body ?? null)}`)
    .digest('hex');
}

export type ExistingKeyDecision =
  // Avvalgi so'rov muvaffaqiyatli tugagan — saqlangan javob qaytariladi, amal takrorlanmaydi
  | { kind: 'replay'; statusCode: number; response: unknown }
  // Kalit boshqa mazmundagi so'rov uchun ishlatilgan — klient xatosi
  | { kind: 'reused' }
  // Avvalgi so'rov hali tugamagan (yoki natijasi saqlanmay qolgan) — amal takrorlanmaydi
  | { kind: 'in_progress' };

export function decideExistingKey(
  existing: {
    requestHash: string;
    statusCode: number | null;
    response: unknown;
  },
  requestHash: string,
): ExistingKeyDecision {
  if (existing.requestHash !== requestHash) return { kind: 'reused' };
  if (existing.statusCode === null) return { kind: 'in_progress' };
  return {
    kind: 'replay',
    statusCode: existing.statusCode,
    response: existing.response,
  };
}

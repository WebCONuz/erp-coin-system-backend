import { PrismaService } from 'src/prisma/prisma.service';

export const DEFAULT_TIMEZONE = 'Asia/Tashkent';

// HH:MM (00:00–23:59), doim ikki xonali soat — vaqtlar matn sifatida solishtiriladi,
// "9:00" kabi qiymat "14:00" dan katta chiqib, to'qnashuv tekshiruvini buzardi
export const HHMM_REGEX = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;
export const HHMM_MESSAGE = "Vaqt formati HH:MM bo'lishi kerak (masalan 09:00)";

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * Berilgan timezone'dagi joriy sana va vaqt: `{ date: 'YYYY-MM-DD', time: 'HH:MM' }`.
 * Sessiya sanasi DB'da `@db.Date` (UTC yarim tun sifatida kodlangan kalendar sana),
 * vaqti esa "HH:MM" matn — shuning uchun solishtirish matn ko'rinishida qilinadi.
 */
export function nowInTimeZone(
  tz: string,
  at: Date = new Date(),
): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(at);
  const get = (type: string) => parts.find((p) => p.type === type)?.value;
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    time: `${get('hour')}:${get('minute')}`,
  };
}

// `@db.Date` qiymatidan kalendar sana ('YYYY-MM-DD')
export function toDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// 'YYYY-MM-DD' ga kun qo'shish (UTC arifmetikasi — timezone siljishi yo'q)
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return toDateString(d);
}

// Ikki 'YYYY-MM-DD' orasidagi kunlar soni (b - a)
export function diffDays(a: string, b: string): number {
  return Math.round(
    (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000,
  );
}

export async function getTenantTimezone(
  prisma: PrismaService,
  tenantId: string,
): Promise<string> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { timezone: true },
  });
  const tz = tenant?.timezone;
  return tz && isValidTimeZone(tz) ? tz : DEFAULT_TIMEZONE;
}

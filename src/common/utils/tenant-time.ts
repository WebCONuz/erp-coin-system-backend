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

const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

// 'YYYY-MM-DD' formatidagi haqiqiy kalendar sana (2026-02-30 kabi qiymatlar rad etiladi)
export function isValidDateOnly(value: string): boolean {
  if (!DATE_ONLY_REGEX.test(value)) return false;
  const d = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && toDateString(d) === value;
}

/**
 * Sana maydoni uchun kiruvchi qiymatni 'YYYY-MM-DD' ga keltiradi: to'liq ISO satr
 * ("2026-11-20T02:00:00+05:00") kelsa — klient yozgan kalendar sana (birinchi 10 belgi)
 * olinadi. Shu tufayli tekshiruv va saqlash doim bir xil sanada bajariladi.
 */
export function normalizeDateOnly(value: unknown): unknown {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)
    ? value.slice(0, 10)
    : value;
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

// ─── Timestamp (timestamptz) bilan ishlash ─────────────────────
// `createdAt` kabi maydonlar aniq vaqt nuqtasi. "Bugun", "shu hafta" tenant mahalliy
// kalendarida hisoblanadi, shuning uchun mahalliy yarim tun UTC instant'iga aylantiriladi.

// `at` paytida timezone'ning UTC dan farqi (daqiqa, masalan Toshkent: +300)
export function timeZoneOffsetMinutes(tz: string, at: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(at);
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  );
  return Math.round((asUtc - Math.floor(at.getTime() / 1000) * 1000) / 60_000);
}

/**
 * Tenant mahalliy kalendaridagi `date` kunining boshlanishi (00:00) — UTC instant sifatida.
 * Masalan Toshkent, '2026-11-20' → 2026-11-19T19:00:00Z. Yozgi vaqt o'tishida ham to'g'ri
 * (offset ikkinchi marta, topilgan instant uchun qayta hisoblanadi).
 */
export function zonedDayStart(tz: string, date: string): Date {
  const utcMidnight = Date.parse(`${date}T00:00:00.000Z`);
  let instant =
    utcMidnight - timeZoneOffsetMinutes(tz, new Date(utcMidnight)) * 60_000;
  instant = utcMidnight - timeZoneOffsetMinutes(tz, new Date(instant)) * 60_000;
  return new Date(instant);
}

// Instant'ning tenant mahalliy kalendar sanasi ('YYYY-MM-DD')
export function localDateOf(tz: string, at: Date): string {
  return nowInTimeZone(tz, at).date;
}

// Hafta boshi (dushanba) — 'YYYY-MM-DD' sanasi uchun
export function startOfWeek(date: string): string {
  const jsDay = new Date(`${date}T00:00:00.000Z`).getUTCDay(); // 0 — yakshanba
  return addDays(date, -((jsDay + 6) % 7));
}

// Oy boshi — 'YYYY-MM-DD' sanasi uchun
export function startOfMonth(date: string): string {
  return `${date.slice(0, 8)}01`;
}

// ─── Tenant timezone ───────────────────────────────────────────

// Timezone deyarli o'zgarmaydi, lekin "bugun" kerak bo'lgan har bir so'rovda o'qiladi —
// qisqa muddatli xotira kesh. Sozlama o'zgarsa shu instance'da darhol tozalanadi;
// boshqa instance'larda ko'pi bilan TTL ichida eskisi qoladi
const TIMEZONE_CACHE_TTL_MS = 60_000;
const timezoneCache = new Map<string, { tz: string; expiresAt: number }>();

export function invalidateTenantTimezone(tenantId?: string): void {
  if (tenantId) timezoneCache.delete(tenantId);
  else timezoneCache.clear();
}

export async function getTenantTimezone(
  prisma: PrismaService,
  tenantId: string,
): Promise<string> {
  const cached = timezoneCache.get(tenantId);
  if (cached && cached.expiresAt > Date.now()) return cached.tz;

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { timezone: true },
  });
  const raw = tenant?.timezone;
  const tz = raw && isValidTimeZone(raw) ? raw : DEFAULT_TIMEZONE;
  if (tenant) {
    timezoneCache.set(tenantId, {
      tz,
      expiresAt: Date.now() + TIMEZONE_CACHE_TTL_MS,
    });
  }
  return tz;
}

// Tenant timezone'i va undagi bugungi sana — dashboard/statistika uchun
export async function getTenantToday(
  prisma: PrismaService,
  tenantId: string,
): Promise<{ tz: string; today: string }> {
  const tz = await getTenantTimezone(prisma, tenantId);
  return { tz, today: localDateOf(tz, new Date()) };
}

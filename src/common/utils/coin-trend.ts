import { CoinDirection } from 'src/generated/prisma/enums';
import { addDays, localDateOf } from './tenant-time';

export interface CoinTrendRow {
  amount: number;
  direction: CoinDirection;
  createdAt: Date;
}

export interface DayTotals {
  earned: number;
  deducted: number;
}

export interface TrendBucket extends DayTotals {
  from: string;
  to: string;
}

// Tranzaksiyalarni tenant mahalliy kunlari bo'yicha yig'adi: 'YYYY-MM-DD' → earn/deduct
export function sumByLocalDay(
  tz: string,
  rows: CoinTrendRow[],
): Map<string, DayTotals> {
  const byDay = new Map<string, DayTotals>();
  for (const row of rows) {
    const day = localDateOf(tz, row.createdAt);
    const totals = byDay.get(day) ?? { earned: 0, deducted: 0 };
    if (row.direction === CoinDirection.earn) totals.earned += row.amount;
    else totals.deducted += row.amount;
    byDay.set(day, totals);
  }
  return byDay;
}

/**
 * `startDate` dan boshlab `count` ta ketma-ket bucket (har biri `bucketDays` kun):
 * `from`/`to` — bucketning birinchi va oxirgi kuni (ikkalasi ham kiradi).
 */
export function buildTrendBuckets(
  byDay: Map<string, DayTotals>,
  startDate: string,
  count: number,
  bucketDays: number,
): TrendBucket[] {
  const buckets: TrendBucket[] = [];
  for (let i = 0; i < count; i++) {
    const from = addDays(startDate, i * bucketDays);
    let earned = 0;
    let deducted = 0;
    for (let d = 0; d < bucketDays; d++) {
      const totals = byDay.get(addDays(from, d));
      if (!totals) continue;
      earned += totals.earned;
      deducted += totals.deducted;
    }
    buckets.push({
      from,
      to: addDays(from, bucketDays - 1),
      earned,
      deducted,
    });
  }
  return buckets;
}

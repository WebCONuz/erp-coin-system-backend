import { CoinDirection } from 'src/generated/prisma/enums';
import { buildTrendBuckets, sumByLocalDay } from './coin-trend';

const TZ = 'Asia/Tashkent'; // UTC+5

describe('sumByLocalDay', () => {
  it('UTC kechqurungi tranzaksiya Toshkentda keyingi kunga tushadi', () => {
    const byDay = sumByLocalDay(TZ, [
      // 2026-11-19 20:00 UTC = 2026-11-20 01:00 Toshkent
      {
        amount: 5,
        direction: CoinDirection.earn,
        createdAt: new Date('2026-11-19T20:00:00Z'),
      },
      {
        amount: 3,
        direction: CoinDirection.deduct,
        createdAt: new Date('2026-11-20T10:00:00Z'),
      },
      {
        amount: 2,
        direction: CoinDirection.earn,
        createdAt: new Date('2026-11-19T18:59:00Z'), // 23:59 Toshkent, 19-noyabr
      },
    ]);
    expect(byDay.get('2026-11-20')).toEqual({ earned: 5, deducted: 3 });
    expect(byDay.get('2026-11-19')).toEqual({ earned: 2, deducted: 0 });
  });
});

describe('buildTrendBuckets', () => {
  const byDay = new Map([
    ['2026-11-16', { earned: 1, deducted: 0 }],
    ['2026-11-18', { earned: 2, deducted: 1 }],
    ['2026-11-23', { earned: 10, deducted: 4 }],
  ]);

  it('kunlik bucketlar', () => {
    const b = buildTrendBuckets(byDay, '2026-11-16', 3, 1);
    expect(b).toEqual([
      { from: '2026-11-16', to: '2026-11-16', earned: 1, deducted: 0 },
      { from: '2026-11-17', to: '2026-11-17', earned: 0, deducted: 0 },
      { from: '2026-11-18', to: '2026-11-18', earned: 2, deducted: 1 },
    ]);
  });

  it('haftalik bucketlar oxirgi kunni ham o`z ichiga oladi', () => {
    const b = buildTrendBuckets(byDay, '2026-11-16', 2, 7);
    expect(b).toEqual([
      { from: '2026-11-16', to: '2026-11-22', earned: 3, deducted: 1 },
      { from: '2026-11-23', to: '2026-11-29', earned: 10, deducted: 4 },
    ]);
  });
});

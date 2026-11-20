import { CoinDirection, SourceType } from 'src/generated/prisma/enums';
import { planSessionCoins } from './session-coin-plan';

const active = (
  id: string,
  amount: number,
  direction: CoinDirection = CoinDirection.earn,
  sourceType: SourceType = SourceType.attendance,
) => ({ id, amount, direction, sourceType });

const item = (
  amount: number,
  sourceType: SourceType = SourceType.attendance,
  direction: CoinDirection = CoinDirection.earn,
) => ({ amount, direction, sourceType });

describe('planSessionCoins', () => {
  it('birinchi saqlash — hammasi yoziladi', () => {
    const plan = planSessionCoins(
      0,
      [],
      [item(5), item(10, SourceType.homework)],
    );
    expect(plan).toMatchObject({
      kind: 'replace',
      reversals: [],
      delta: 15,
    });
    if (plan.kind === 'replace') expect(plan.creates).toHaveLength(2);
  });

  it("o'zgarmagan qayta saqlash — hech narsa yozilmaydi (tartib muhim emas)", () => {
    const plan = planSessionCoins(
      15,
      [
        active('a', 10, CoinDirection.earn, SourceType.homework),
        active('b', 5),
      ],
      [item(5), item(10, SourceType.homework)],
    );
    expect(plan).toEqual({ kind: 'unchanged' });
  });

  it("0 miqdorli elementlar e'tiborga olinmaydi", () => {
    expect(planSessionCoins(5, [active('a', 5)], [item(5), item(0)])).toEqual({
      kind: 'unchanged',
    });
  });

  it("o'zgargan — avvalgisi bekor, yangisi yoziladi, sof delta", () => {
    const plan = planSessionCoins(5, [active('a', 5)], [item(8)]);
    expect(plan).toMatchObject({
      kind: 'replace',
      reversals: [{ id: 'a' }],
      delta: 3,
    });
  });

  it("coin sarflangan bo'lsa — blocked", () => {
    const plan = planSessionCoins(3, [active('a', 10)], []);
    expect(plan).toMatchObject({
      kind: 'blocked',
      code: 'COINS_ALREADY_SPENT',
    });
  });

  it("jarimaga balans yetmasa — faqat jarima o'tkazib yuboriladi", () => {
    const plan = planSessionCoins(
      1,
      [],
      [
        item(3, SourceType.attendance, CoinDirection.deduct),
        item(10, SourceType.homework),
      ],
    );
    expect(plan).toMatchObject({ kind: 'replace', delta: 10 });
    if (plan.kind !== 'replace') return;
    expect(plan.creates).toHaveLength(1);
    expect(plan.skippedItems).toEqual([
      expect.objectContaining({ code: 'INSUFFICIENT_BALANCE_FOR_PENALTY' }),
    ]);
  });

  it('ayirish va qo`shishni birga bekor qilish — balans 0 ga tushadi, manfiy emas', () => {
    // +5 berilgan, -3 jarima; balans 2 → hammasi bekor → 0
    const plan = planSessionCoins(
      2,
      [active('e', 5), active('d', 3, CoinDirection.deduct)],
      [],
    );
    expect(plan).toMatchObject({ kind: 'replace', delta: -2 });
  });
});

import { CoinDirection, SourceType } from 'src/generated/prisma/enums';
import { SessionCoinItem, SkippedSessionCoinItem } from 'src/common/types';
import { COIN_SKIP_CODES } from 'src/sessions/constants/session-types';

// Sessiya tekshiruvi orqali berilgan, hali bekor qilinmagan tranzaksiya (hisob uchun kerakli qismi)
export interface ActiveSessionCoin {
  id: string;
  amount: number;
  direction: CoinDirection;
  sourceType: SourceType;
}

export type SessionCoinPlan<T extends ActiveSessionCoin> =
  // Coinlar avvalgisi bilan bir xil — hech narsa yozilmaydi (tarixda ortiqcha juftlik yo'q)
  | { kind: 'unchanged' }
  // Avvalgi coinlarni qaytarib bo'lmaydi (o'quvchi sarflab bo'lgan) — hech narsa o'zgarmaydi
  | { kind: 'blocked'; code: string; reason: string }
  | {
      kind: 'replace';
      reversals: T[];
      creates: SessionCoinItem[];
      skippedItems: SkippedSessionCoinItem[];
      // Hamyon balansining sof o'zgarishi
      delta: number;
    };

const signed = (c: { amount: number; direction: CoinDirection }) =>
  c.direction === CoinDirection.earn ? c.amount : -c.amount;

const coinKey = (c: {
  amount: number;
  direction: CoinDirection;
  sourceType: SourceType;
}) => `${c.sourceType}|${c.direction}|${c.amount}`;

// Ikki to'plam (manba + yo'nalish + miqdor) bo'yicha bir xilmi — tartibdan qat'i nazar
function sameCoins(
  active: ActiveSessionCoin[],
  items: SessionCoinItem[],
): boolean {
  if (active.length !== items.length) return false;
  const a = active.map(coinKey).sort();
  const b = items.map(coinKey).sort();
  return a.every((key, i) => key === b[i]);
}

/**
 * Bitta o'quvchining sessiya coinlarini almashtirish rejasi (sof funksiya — DB'siz):
 * - kerakli coinlar avvalgisi bilan bir xil bo'lsa — `unchanged`;
 * - avvalgilarini bekor qilganda balans manfiy bo'lsa — `blocked` (COINS_ALREADY_SPENT);
 * - aks holda avvalgilari bekor qilinadi va yangilari yoziladi; balans yetmagan
 *   jarima (deduct) elementi o'tkazib yuboriladi (INSUFFICIENT_BALANCE_FOR_PENALTY).
 * Yakuniy balans hech qachon manfiy bo'lmaydi.
 */
export function planSessionCoins<T extends ActiveSessionCoin>(
  balance: number,
  active: T[],
  rawItems: SessionCoinItem[],
): SessionCoinPlan<T> {
  const items = rawItems.filter((i) => i.amount > 0);

  if (sameCoins(active, items)) return { kind: 'unchanged' };

  const reversalDelta = active.reduce((sum, trx) => sum - signed(trx), 0);
  let current = balance + reversalDelta;

  if (current < 0) {
    return {
      kind: 'blocked',
      code: COIN_SKIP_CODES.COINS_ALREADY_SPENT,
      reason: `Balans yetarli emas (joriy: ${balance}, qaytarish uchun kerak: ${-reversalDelta}) — talaba avvalgi coinlarni allaqachon sarflab bo'lgan`,
    };
  }

  const creates: SessionCoinItem[] = [];
  const skippedItems: SkippedSessionCoinItem[] = [];

  for (const item of items) {
    if (item.direction === CoinDirection.deduct && current < item.amount) {
      skippedItems.push({
        sourceType: item.sourceType,
        direction: item.direction,
        amount: item.amount,
        code: COIN_SKIP_CODES.INSUFFICIENT_BALANCE_FOR_PENALTY,
        reason: `Jarima uchun balans yetarli emas (joriy: ${current}, kerak: ${item.amount})`,
      });
      continue;
    }
    current += signed(item);
    creates.push(item);
  }

  return {
    kind: 'replace',
    reversals: active,
    creates,
    skippedItems,
    delta: current - balance,
  };
}

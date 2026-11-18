import { Prisma } from 'src/generated/prisma/client';

/**
 * "Amaldagi" coin tranzaksiyasi — statistikada (jami olingan/ayirilgan, reyting, sessiyadan
 * olingan coin) hisoblanadigan yozuv:
 * - eski usulda soft-delete qilinmagan (`isDeleted: false`, 2026-11 gacha bekor qilinganlar);
 * - o'zi teskari yozuv emas (`reversalOfId: null`);
 * - bekor qilinmagan, ya'ni unga teskari yozuv yo'q (`reversal: null`).
 *
 * Bekor qilingan juftlik (asl + teskari) statistikaga kirmaydi — natija soft-delete bilan bir xil.
 * Tarix ro'yxatlarida esa (GET /coin-transactions/history, my-history) ikkalasi ham ko'rinadi.
 * Balans hisobi juftlik bilan ham to'g'ri: asl + teskari = 0.
 */
export const EFFECTIVE_COIN_TX_WHERE = {
  isDeleted: false,
  reversalOfId: null,
  reversal: { is: null },
} satisfies Prisma.CoinTransactionWhereInput;

// Tarix ro'yxati uchun: eski soft-delete qilinganlardan tashqari hammasi (teskari yozuvlar ham)
export const VISIBLE_COIN_TX_WHERE = {
  isDeleted: false,
} satisfies Prisma.CoinTransactionWhereInput;

-- Coin yaxlitligi (2-bosqich):
--  1) tenant bo'yicha teacher coin limiti
--  2) CoinTransaction.purchaseId (FK) + mavjud xarid tranzaksiyalarini note'dan backfill
--  3) CoinTransaction.reversalOfId — teskari yozuv (bekor qilish asl yozuvni o'chirmaydi)
--  4) DB darajasidagi CHECK cheklovlari: balans manfiy emas, summa musbat, limit musbat
--
-- Diqqat: CHECK cheklovlari mavjud ma'lumot ularni buzsa migration xato beradi.
-- Production'da qo'llashdan oldin tekshiring:
--   SELECT count(*) FROM wallets WHERE balance < 0;
--   SELECT count(*) FROM coin_transactions WHERE amount <= 0;

-- DropIndex (sessionId bo'yicha qidiruvni yangi composite index qoplaydi)
DROP INDEX "coin_transactions_session_id_idx";

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "teacher_coin_limit" INTEGER;

-- AlterTable
ALTER TABLE "coin_transactions" ADD COLUMN     "purchase_id" UUID,
ADD COLUMN     "reversal_of_id" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "coin_transactions_reversal_of_id_key" ON "coin_transactions"("reversal_of_id");

-- CreateIndex
CREATE INDEX "coin_transactions_session_id_student_id_source_type_idx" ON "coin_transactions"("session_id", "student_id", "source_type");

-- CreateIndex
CREATE INDEX "coin_transactions_purchase_id_idx" ON "coin_transactions"("purchase_id");

-- CreateIndex
CREATE INDEX "purchases_reward_id_idx" ON "purchases"("reward_id");

-- AddForeignKey
ALTER TABLE "coin_transactions" ADD CONSTRAINT "coin_transactions_purchase_id_fkey" FOREIGN KEY ("purchase_id") REFERENCES "purchases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coin_transactions" ADD CONSTRAINT "coin_transactions_reversal_of_id_fkey" FOREIGN KEY ("reversal_of_id") REFERENCES "coin_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: avval xarid bilan bog'lanish faqat note matnida edi ("... Xarid ID: <uuid>")
UPDATE "coin_transactions" t
SET "purchase_id" = p."id"
FROM "purchases" p
WHERE t."source_type" = 'purchase'
  AND t."purchase_id" IS NULL
  AND p."id" = substring(t."note" from 'Xarid ID: ([0-9a-fA-F-]{36})')::uuid;

-- CHECK cheklovlari — kod xatosi yoki race condition bo'lsa ham DB noto'g'ri holatni saqlamaydi
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_balance_non_negative" CHECK ("balance" >= 0);
ALTER TABLE "coin_transactions" ADD CONSTRAINT "coin_transactions_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "coin_transactions" ADD CONSTRAINT "coin_transactions_not_self_reversal" CHECK ("reversal_of_id" IS NULL OR "reversal_of_id" <> "id");
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_teacher_coin_limit_positive" CHECK ("teacher_coin_limit" IS NULL OR "teacher_coin_limit" > 0);

-- AlterTable: username ustuni (avval NULL bilan — mavjud qatorlarni to'ldirish uchun)
ALTER TABLE "users" ADD COLUMN "username" VARCHAR(30);

-- Backfill: mavjud userlar uchun username = telefon raqam ('+' siz), masalan +998901234567 -> 998901234567.
-- Telefon hozirgacha global unique bo'lgani uchun to'qnashuv bo'lmaydi.
-- creator va super_admin username'lari `npx prisma db seed` da .env dagi CREATOR_USERNAME / SUPER_ADMIN_USERNAME ga yangilanadi.
UPDATE "users" SET "username" = lower(replace("phone", '+', ''));

ALTER TABLE "users" ALTER COLUMN "username" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- Telefon: global unique -> tenant ichida unique
DROP INDEX "users_phone_key";
CREATE UNIQUE INDEX "users_tenant_id_phone_key" ON "users"("tenant_id", "phone");

-- Email: endi unique emas (bir odam turli tenantlarda bir xil emailni ishlatishi mumkin)
DROP INDEX "users_email_key";
CREATE INDEX "users_email_idx" ON "users"("email");

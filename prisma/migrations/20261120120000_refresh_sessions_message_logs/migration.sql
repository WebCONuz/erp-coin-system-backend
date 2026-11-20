-- Audit 2-bosqich:
--  1) Ko'p qurilmali sessiyalar: refresh_sessions jadvali, users.refresh_token_hash olib tashlanadi.
--     Diqqat: deploy'dan keyin barcha userlar bir marta qayta login qiladi (eski refresh tokenlar yaroqsiz).
--  2) SMS/email loglari tenant useri bo'lmagan qabul qiluvchi (ota-ona, lid) uchun ham yoziladi —
--     student_id ixtiyoriy.
--  3) Eski (xom) parol tiklash tokenlari yaroqsiz qilinadi — endi faqat sha256 hash saqlanadi.

-- CreateTable
CREATE TABLE "refresh_sessions" (
    "id" UUID NOT NULL,
    "token_hash" VARCHAR(64) NOT NULL,
    "previous_token_hash" VARCHAR(64),
    "rotated_at" TIMESTAMPTZ,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "user_agent" VARCHAR(300),
    "ip_address" VARCHAR(64),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_id" UUID NOT NULL,

    CONSTRAINT "refresh_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "refresh_sessions_token_hash_key" ON "refresh_sessions"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_sessions_user_id_idx" ON "refresh_sessions"("user_id");

-- AddForeignKey
ALTER TABLE "refresh_sessions" ADD CONSTRAINT "refresh_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "users" DROP COLUMN "refresh_token_hash";

-- Xom saqlangan tiklash tokenlari endi hash bilan solishtiriladi — ularni bekor qilamiz
UPDATE "users" SET "password_reset_token" = NULL, "password_reset_expiry" = NULL
WHERE "password_reset_token" IS NOT NULL;

-- DropForeignKey
ALTER TABLE "sms_logs" DROP CONSTRAINT "sms_logs_student_id_fkey";

-- DropForeignKey
ALTER TABLE "email_logs" DROP CONSTRAINT "email_logs_student_id_fkey";

-- AlterTable
ALTER TABLE "sms_logs" ALTER COLUMN "student_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "email_logs" ALTER COLUMN "student_id" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "sms_logs" ADD CONSTRAINT "sms_logs_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_logs" ADD CONSTRAINT "email_logs_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

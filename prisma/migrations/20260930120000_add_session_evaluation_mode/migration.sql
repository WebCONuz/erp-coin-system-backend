-- CreateEnum: sessiya qanday tekshiriladi
CREATE TYPE "EvaluationMode" AS ENUM ('attendance', 'scored');

-- AlterEnum: imtihon natijasi uchun tanga manbasi
ALTER TYPE "SourceType" ADD VALUE 'exam' BEFORE 'manual';

-- AlterTable: sessiya baholash rejimi va maksimal ball
ALTER TABLE "sessions" ADD COLUMN "evaluation_mode" "EvaluationMode" NOT NULL DEFAULT 'attendance',
ADD COLUMN "max_score" INTEGER;

-- AlterTable: o'quvchi bali va izohi
ALTER TABLE "attendance_records" ADD COLUMN "score" DOUBLE PRECISION,
ADD COLUMN "note" VARCHAR(500);

-- Backfill: hali tekshirilmagan imtihon/musobaqa sessiyalari ball rejimiga o'tadi.
-- Allaqachon yo'qlama qilinganlari attendance rejimida qoladi — ularning
-- mavjud davomat coinlari buzilmasligi uchun.
UPDATE "sessions"
SET "evaluation_mode" = 'scored'
WHERE "session_type" IN ('exam', 'competition') AND "is_checked" = false;

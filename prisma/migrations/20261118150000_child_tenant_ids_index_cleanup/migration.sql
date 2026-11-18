-- DB sxemasini tozalash (4-bosqich):
--  1) CoinTransaction / Purchase / AttendanceRecord ga tenant_id — tenant izolyatsiyasi
--     DB darajasida, student/session orqali join qilmasdan filtrlash
--  2) Selektivligi past bitta boolean indexlar (is_deleted, is_active, is_system) olib tashlanadi —
--     o'qishda foyda bermaydi, har bir yozishni sekinlashtiradi
--  3) attendance_records(session_id, student_id) dublikat index — unique index uni qoplaydi

-- ─── 1. tenant_id: nullable qo'shish → backfill → NOT NULL ───

ALTER TABLE "coin_transactions" ADD COLUMN "tenant_id" UUID;
ALTER TABLE "purchases" ADD COLUMN "tenant_id" UUID;
ALTER TABLE "attendance_records" ADD COLUMN "tenant_id" UUID;

-- Tranzaksiya va xarid — o'quvchining tenanti
UPDATE "coin_transactions" t SET "tenant_id" = u."tenant_id"
FROM "users" u WHERE u."id" = t."student_id";

UPDATE "purchases" p SET "tenant_id" = u."tenant_id"
FROM "users" u WHERE u."id" = p."student_id";

-- Yo'qlama — sessiyaning tenanti
UPDATE "attendance_records" a SET "tenant_id" = s."tenant_id"
FROM "sessions" s WHERE s."id" = a."session_id";

ALTER TABLE "coin_transactions" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "purchases" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "attendance_records" ALTER COLUMN "tenant_id" SET NOT NULL;

-- CreateIndex
CREATE INDEX "attendance_records_tenant_id_idx" ON "attendance_records"("tenant_id");
CREATE INDEX "coin_transactions_tenant_id_created_at_idx" ON "coin_transactions"("tenant_id", "created_at" DESC);
CREATE INDEX "purchases_tenant_id_status_idx" ON "purchases"("tenant_id", "status");

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "coin_transactions" ADD CONSTRAINT "coin_transactions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── 2–3. Foydasiz indexlar ───

DROP INDEX "roles_is_system_idx";
DROP INDEX "users_is_active_idx";
DROP INDEX "users_is_deleted_idx";
DROP INDEX "courses_is_active_idx";
DROP INDEX "courses_is_deleted_idx";
DROP INDEX "subjects_is_active_idx";
DROP INDEX "subjects_is_deleted_idx";
DROP INDEX "rooms_is_active_idx";
DROP INDEX "groups_is_active_idx";
DROP INDEX "groups_is_deleted_idx";
DROP INDEX "group_students_is_deleted_idx";
DROP INDEX "schedule_templates_is_deleted_idx";
DROP INDEX "schedule_exceptions_is_deleted_idx";
DROP INDEX "coin_rules_is_active_idx";
DROP INDEX "coin_rules_is_deleted_idx";
DROP INDEX "sessions_is_deleted_idx";
DROP INDEX "attendance_records_session_id_student_id_idx";
DROP INDEX "attendance_records_is_deleted_idx";
DROP INDEX "coin_transactions_is_deleted_idx";
DROP INDEX "reward_categories_is_deleted_idx";
DROP INDEX "rewards_is_deleted_idx";
DROP INDEX "purchases_status_idx";
DROP INDEX "purchases_is_deleted_idx";
DROP INDEX "sms_templates_is_deleted_idx";
DROP INDEX "sms_logs_is_deleted_idx";
DROP INDEX "email_templates_is_deleted_idx";
DROP INDEX "email_logs_is_deleted_idx";
DROP INDEX "import_logs_is_deleted_idx";

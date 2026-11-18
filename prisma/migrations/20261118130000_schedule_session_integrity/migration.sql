-- Jadval va sessiyalar (3A-bosqich):
--  1) Tenant.timezone — "bugun", "dars boshlandimi", tahrirlash muddati shu bo'yicha
--  2) Session.checkedAt — yo'qlama birinchi saqlangan vaqt (teacher 3 kun tahrirlay oladi)
--  3) Session.templateId — sessiya qaysi jadval shablonidan yaratilgan (sinxronlash uchun)

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "timezone" VARCHAR(64) NOT NULL DEFAULT 'Asia/Tashkent';

-- AlterTable
ALTER TABLE "sessions" ADD COLUMN     "checked_at" TIMESTAMPTZ,
ADD COLUMN     "template_id" UUID;

-- CreateIndex
CREATE INDEX "sessions_template_id_session_date_idx" ON "sessions"("template_id", "session_date");

-- CreateIndex
CREATE INDEX "sessions_tenant_id_session_date_idx" ON "sessions"("tenant_id", "session_date");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "schedule_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: tekshirilgan sessiyalar uchun birinchi saqlash vaqti — eng birinchi yo'qlama yozuvi
-- (upsert yangilashda recorded_at o'zgarmaydi, shuning uchun min = birinchi saqlash)
UPDATE "sessions" s
SET "checked_at" = a.first_recorded
FROM (
  SELECT "session_id", min("recorded_at") AS first_recorded
  FROM "attendance_records"
  GROUP BY "session_id"
) a
WHERE a."session_id" = s."id"
  AND s."is_checked" = true
  AND s."checked_at" IS NULL;

-- Backfill: mavjud dars sessiyalarini shablonga bog'lash — faqat bir ma'noli mos kelganda
-- (shu guruh, shu hafta kuni, shu boshlanish vaqti, o'chirilmagan shablon aynan bitta)
WITH matches AS (
  SELECT s."id" AS session_id, min(t."id"::text)::uuid AS template_id, count(*) AS cnt
  FROM "sessions" s
  JOIN "schedule_templates" t
    ON t."group_id" = s."group_id"
   AND t."is_deleted" = false
   AND t."start_time" = s."start_time"
   AND t."weekday"::text = lower(trim(to_char(s."session_date", 'FMDay')))
  WHERE s."is_deleted" = false
    AND s."session_type" = 'lesson'
    AND s."template_id" IS NULL
  GROUP BY s."id"
)
UPDATE "sessions" s
SET "template_id" = m.template_id
FROM matches m
WHERE m.session_id = s."id" AND m.cnt = 1;

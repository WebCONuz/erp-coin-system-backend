-- Jadval va sessiyalar (3B-bosqich):
--  1) AttendanceRecord.status (present / late / excused / absent) + SourceType 'late'
--  2) Holiday — tenant bo'yicha dam olish kunlari
--  3) ScheduleTemplate.validFrom / validTo — shablonning amal qilish muddati
--  4) ScheduleException.roomId / teacherId — shu kun uchun xona / o'rinbosar o'qituvchi
--  5) GroupStudent.leftAt — guruhdan chiqarilgan vaqt

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('present', 'late', 'excused', 'absent');

-- AlterEnum (yangi qiymat shu migratsiyada ishlatilmaydi)
ALTER TYPE "SourceType" ADD VALUE 'late';

-- AlterTable
ALTER TABLE "group_students" ADD COLUMN     "left_at" TIMESTAMPTZ;

-- AlterTable
ALTER TABLE "schedule_templates" ADD COLUMN     "valid_from" DATE,
ADD COLUMN     "valid_to" DATE;

-- AlterTable
ALTER TABLE "schedule_exceptions" ADD COLUMN     "room_id" UUID,
ADD COLUMN     "teacher_id" UUID;

-- AlterTable
ALTER TABLE "attendance_records" ADD COLUMN     "status" "AttendanceStatus" NOT NULL DEFAULT 'absent';

-- CreateTable
CREATE TABLE "holidays" (
    "id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ,
    "tenant_id" UUID NOT NULL,
    "created_by" UUID NOT NULL,

    CONSTRAINT "holidays_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "holidays_tenant_id_date_key" ON "holidays"("tenant_id", "date");

-- AddForeignKey
ALTER TABLE "schedule_exceptions" ADD CONSTRAINT "schedule_exceptions_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_exceptions" ADD CONSTRAINT "schedule_exceptions_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "holidays" ADD CONSTRAINT "holidays_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "holidays" ADD CONSTRAINT "holidays_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill: mavjud yo'qlamalar — keldi/kelmadi (sabab ma'lum emas, shuning uchun 'absent')
UPDATE "attendance_records" SET "status" = CASE WHEN "is_present" THEN 'present'::"AttendanceStatus" ELSE 'absent'::"AttendanceStatus" END;

-- Backfill: avval chiqarilgan o'quvchilar uchun chiqish vaqti — arxivlangan vaqt
UPDATE "group_students" SET "left_at" = "archived_at" WHERE "is_deleted" = true AND "left_at" IS NULL AND "archived_at" IS NOT NULL;

-- Shablon muddati to'g'ri oraliq bo'lishi kerak
ALTER TABLE "schedule_templates" ADD CONSTRAINT "schedule_templates_valid_range" CHECK ("valid_from" IS NULL OR "valid_to" IS NULL OR "valid_from" <= "valid_to");

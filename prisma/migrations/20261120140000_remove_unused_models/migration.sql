-- Audit 9-bosqich: kodda ishlatilmaydigan modellar va maydonlar olib tashlanadi (foydalanuvchi qarori):
--  - role_permissions (ruxsatlar rol level'i bilan tekshiriladi)
--  - import_logs + "ImportStatus" (import funksiyasi yo'q)
--  - roles.can_delete / can_manage_admins / can_manage_users / is_system (hech qayerda tekshirilmaydi)
--  - "NotificationType" enum'i (hech qaysi ustunda ishlatilmaydi)
-- SMS/email shablonlari (sms_templates, email_templates) qoldirildi.
--
-- Diqqat: jadvallardagi ma'lumot o'chadi. Qo'llashdan oldin tekshiring (0 bo'lishi kutiladi):
--   SELECT count(*) FROM role_permissions;
--   SELECT count(*) FROM import_logs;

-- DropForeignKey
ALTER TABLE "role_permissions" DROP CONSTRAINT "role_permissions_role_id_fkey";

-- DropForeignKey
ALTER TABLE "role_permissions" DROP CONSTRAINT "role_permissions_tenant_id_fkey";

-- DropForeignKey
ALTER TABLE "import_logs" DROP CONSTRAINT "import_logs_imported_by_fkey";

-- AlterTable
ALTER TABLE "roles" DROP COLUMN "can_delete",
DROP COLUMN "can_manage_admins",
DROP COLUMN "can_manage_users",
DROP COLUMN "is_system";

-- DropTable
DROP TABLE "role_permissions";

-- DropTable
DROP TABLE "import_logs";

-- DropEnum
DROP TYPE "ImportStatus";

-- DropEnum
DROP TYPE "NotificationType";

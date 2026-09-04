-- CreateEnum
CREATE TYPE "TenantType" AS ENUM ('learning_center', 'school', 'academic_lyceum', 'college', 'university');

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "tenant_type" "TenantType";

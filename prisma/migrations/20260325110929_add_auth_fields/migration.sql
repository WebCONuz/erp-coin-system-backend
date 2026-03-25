-- AlterTable
ALTER TABLE "users" ADD COLUMN     "password_reset_expiry" TIMESTAMPTZ,
ADD COLUMN     "password_reset_token" TEXT,
ADD COLUMN     "refresh_token_hash" TEXT;

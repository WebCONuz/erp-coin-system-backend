-- Audit 7-bosqich:
--  1) idempotency_keys — coin berish va xarid so'rovlari takrorlanganda (ikki marta bosish,
--     tarmoq retry) amal ikki marta bajarilmasligi uchun
--  2) audit_logs indekslari: asosiy so'rov (tenant + eng yangilari) va entitet tarixi uchun
--     composite index; alohida tenant_id va created_at indekslari o'rniga
-- Tenant soft delete uchun sxema o'zgarishi kerak emas (is_deleted / deleted_at mavjud).

-- CreateTable
CREATE TABLE "idempotency_keys" (
    "id" UUID NOT NULL,
    "key" VARCHAR(100) NOT NULL,
    "request_hash" VARCHAR(64) NOT NULL,
    "status_code" SMALLINT,
    "response" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,

    CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idempotency_keys_expires_at_idx" ON "idempotency_keys"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_keys_tenant_id_user_id_key_key" ON "idempotency_keys"("tenant_id", "user_id", "key");

-- AddForeignKey
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- DropIndex
DROP INDEX "audit_logs_tenant_id_idx";

-- DropIndex
DROP INDEX "audit_logs_created_at_idx";

-- CreateIndex
CREATE INDEX "audit_logs_tenant_id_created_at_idx" ON "audit_logs"("tenant_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "audit_logs_tenant_id_entityId_idx" ON "audit_logs"("tenant_id", "entityId");

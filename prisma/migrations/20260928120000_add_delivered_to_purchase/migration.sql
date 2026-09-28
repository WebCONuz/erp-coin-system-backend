-- AlterTable: sovg'a qachon va kim tomonidan qo'lga berilgani
ALTER TABLE "purchases" ADD COLUMN "delivered_at" TIMESTAMPTZ,
ADD COLUMN "delivered_by" UUID;

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_delivered_by_fkey" FOREIGN KEY ("delivered_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

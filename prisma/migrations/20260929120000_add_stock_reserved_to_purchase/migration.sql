-- AlterTable: xarid paytida sovg'a zaxirasidan dona ayirilganmi
ALTER TABLE "purchases" ADD COLUMN "stock_reserved" BOOLEAN NOT NULL DEFAULT false;

-- Backfill (taxminiy): mavjud xaridlar uchun sovg'aning hozirgi zaxirasiga qaraymiz.
-- Sovg'a hozir cheksiz (-1) bo'lmasa — xarid paytida dona ayirilgan deb hisoblaymiz.
UPDATE "purchases" p
SET "stock_reserved" = true
FROM "rewards" r
WHERE p."reward_id" = r."id" AND r."stock" <> -1;

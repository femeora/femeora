ALTER TABLE "pools"
    ADD COLUMN "initial_active_bin" INTEGER;

ALTER TABLE "swaps"
    ADD COLUMN "transaction_index" INTEGER NOT NULL DEFAULT 0;

UPDATE "pools"
SET "initial_active_bin" = "active_bin"
WHERE "type" = 'DLMM';

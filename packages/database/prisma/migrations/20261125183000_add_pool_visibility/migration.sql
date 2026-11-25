ALTER TABLE "pools"
ADD COLUMN "visible" BOOLEAN NOT NULL DEFAULT true;

-- The first DELTA/WETH pool was initialized at an invalid 1:1 market price.
-- Preserve its indexed on-chain history while removing it from public discovery.
UPDATE "pools"
SET "visible" = false
WHERE "chain_id" = 4663
  AND lower("address") = '0x3316db295fee78d8fb559560586cfeaee15e8654';

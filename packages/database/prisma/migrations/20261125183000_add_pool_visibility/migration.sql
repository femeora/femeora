ALTER TABLE "pools"
ADD COLUMN "visible" BOOLEAN NOT NULL DEFAULT true;

-- The first DELTA/WETH pool was initialized at an invalid 1:1 market price.
-- Preserve its indexed on-chain history while removing it from public discovery.
UPDATE "pools"
SET "visible" = false
WHERE "chain_id" = 4663
  AND lower("address") = '0x3316db295fee78d8fb559560586cfeaee15e8654';

-- Orient the replacement market as WETH-quoted and immediately carry the same
-- external DELTA/WETH reference history onto its chart. Pool trades and
-- liquidity remain isolated; only market-reference candles are copied.
UPDATE "pools"
SET "quote_token" = '0x0bd7d308f8e1639fab988df18a8011f41eacad73'
WHERE "chain_id" = 4663
  AND lower("address") = '0xbf8a5a678b7c127bf5b2faa35a6a3c67afe4cf70';

INSERT INTO "reference_candles" (
  "pool_id", "interval", "bucket_start", "open", "high", "low", "close",
  "source_type", "source_updated_at", "stale", "updated_at"
)
SELECT
  replacement."id", candle."interval", candle."bucket_start", candle."open",
  candle."high", candle."low", candle."close", candle."source_type",
  candle."source_updated_at", candle."stale", candle."updated_at"
FROM "pools" legacy
JOIN "reference_candles" candle ON candle."pool_id" = legacy."id"
JOIN "pools" replacement
  ON replacement."chain_id" = legacy."chain_id"
 AND lower(replacement."address") = '0xbf8a5a678b7c127bf5b2faa35a6a3c67afe4cf70'
WHERE legacy."chain_id" = 4663
  AND lower(legacy."address") = '0x3316db295fee78d8fb559560586cfeaee15e8654'
ON CONFLICT ("pool_id", "interval", "bucket_start") DO NOTHING;

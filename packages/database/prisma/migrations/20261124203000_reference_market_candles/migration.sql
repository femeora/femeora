CREATE TABLE "asset_price_sources" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "chain_id" INTEGER NOT NULL,
  "token_address" VARCHAR(42) NOT NULL,
  "source_type" VARCHAR(24) NOT NULL,
  "feed_address" VARCHAR(42),
  "symbol" VARCHAR(32) NOT NULL,
  "quote_currency" VARCHAR(12) NOT NULL DEFAULT 'USD',
  "heartbeat_seconds" INTEGER NOT NULL DEFAULT 86400,
  "priority" INTEGER NOT NULL DEFAULT 100,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "asset_price_sources_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "reference_candles" (
  "pool_id" UUID NOT NULL,
  "interval" VARCHAR(8) NOT NULL,
  "bucket_start" TIMESTAMP(3) NOT NULL,
  "open" DECIMAL(78,18) NOT NULL,
  "high" DECIMAL(78,18) NOT NULL,
  "low" DECIMAL(78,18) NOT NULL,
  "close" DECIMAL(78,18) NOT NULL,
  "source_type" VARCHAR(24) NOT NULL,
  "source_updated_at" TIMESTAMP(3) NOT NULL,
  "stale" BOOLEAN NOT NULL DEFAULT false,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "reference_candles_pkey" PRIMARY KEY ("pool_id", "interval", "bucket_start")
);

CREATE UNIQUE INDEX "asset_price_sources_chain_id_token_address_source_type_key"
ON "asset_price_sources"("chain_id", "token_address", "source_type");
CREATE INDEX "asset_price_sources_chain_id_enabled_priority_idx"
ON "asset_price_sources"("chain_id", "enabled", "priority");
CREATE INDEX "reference_candles_pool_id_interval_bucket_start_idx"
ON "reference_candles"("pool_id", "interval", "bucket_start");

ALTER TABLE "reference_candles"
ADD CONSTRAINT "reference_candles_pool_id_fkey"
FOREIGN KEY ("pool_id") REFERENCES "pools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "asset_price_sources" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "reference_candles" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "asset_price_sources" FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE "reference_candles" FROM PUBLIC, anon, authenticated;

INSERT INTO "asset_price_sources"
  ("chain_id", "token_address", "source_type", "feed_address", "symbol", "heartbeat_seconds", "priority", "updated_at")
VALUES
  (4663, '0x0bd7d308f8e1639fab988df18a8011f41eacad73', 'CHAINLINK', '0x78f3556b67e17df817d51ef5a990cdaf09e8d3a9', 'WETH', 86400, 10, CURRENT_TIMESTAMP),
  (4663, '0x5fc5360d0400a0fd4f2af552add042d716f1d168', 'CHAINLINK', '0x61b7e5650328764b076a108eff5fa7282a1b9ad2', 'USDG', 86400, 10, CURRENT_TIMESTAMP)
ON CONFLICT ("chain_id", "token_address", "source_type") DO UPDATE SET
  "feed_address" = EXCLUDED."feed_address",
  "heartbeat_seconds" = EXCLUDED."heartbeat_seconds",
  "priority" = EXCLUDED."priority",
  "enabled" = true,
  "updated_at" = CURRENT_TIMESTAMP;

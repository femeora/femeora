-- Candidate quote selection belongs to product data so each market can choose
-- its natural quote asset without a pair-specific web constant.
ALTER TABLE "asset_display_configs"
  ADD COLUMN "candidate_quote_address" VARCHAR(42);

INSERT INTO "asset_catalog" (
  "chain_id", "address", "source", "source_asset_id", "symbol", "name",
  "decimals", "logo_url", "category", "isin", "status",
  "current_multiplier", "market_status", "extended_status",
  "overnight_status", "source_updated_at", "created_at", "updated_at"
)
VALUES (
  4663,
  '0xe8ffd7e24187f72afb08d75b1bb13088a989a791',
  'chain',
  'delta',
  'DELTA',
  'Delta',
  18,
  'https://cdn.dexscreener.com/cms/images/R0D6i-QgKwRAa7sg?width=800&height=800&quality=95&format=auto',
  'crypto',
  NULL,
  'ASSET_STATUS_ACTIVE',
  NULL,
  NULL,
  NULL,
  NULL,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("chain_id", "address") DO UPDATE SET
  "source" = EXCLUDED."source",
  "source_asset_id" = EXCLUDED."source_asset_id",
  "symbol" = EXCLUDED."symbol",
  "name" = EXCLUDED."name",
  "decimals" = EXCLUDED."decimals",
  "logo_url" = EXCLUDED."logo_url",
  "category" = EXCLUDED."category",
  "status" = EXCLUDED."status",
  "source_updated_at" = EXCLUDED."source_updated_at",
  "updated_at" = CURRENT_TIMESTAMP;

INSERT INTO "asset_display_configs" (
  "chain_id", "address", "candidate_enabled", "candidate_rank",
  "candidate_quote_address", "logo_url", "created_at", "updated_at"
)
VALUES (
  4663,
  '0xe8ffd7e24187f72afb08d75b1bb13088a989a791',
  true,
  21,
  '0x0bd7d308f8e1639fab988df18a8011f41eacad73',
  'https://cdn.dexscreener.com/cms/images/R0D6i-QgKwRAa7sg?width=800&height=800&quality=95&format=auto',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("chain_id", "address") DO UPDATE SET
  "candidate_enabled" = true,
  "candidate_rank" = EXCLUDED."candidate_rank",
  "candidate_quote_address" = EXCLUDED."candidate_quote_address",
  "logo_url" = EXCLUDED."logo_url",
  "updated_at" = CURRENT_TIMESTAMP;

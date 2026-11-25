-- PONS is a curated Robinhood Chain candidate. Keeping its metadata and
-- presentation in database tables lets the API expose it without a web
-- source-code exception or requiring an existing Femeora pool.
INSERT INTO "asset_catalog" (
  "chain_id", "address", "source", "source_asset_id", "symbol", "name",
  "decimals", "logo_url", "category", "isin", "status",
  "current_multiplier", "market_status", "extended_status",
  "overnight_status", "source_updated_at", "created_at", "updated_at"
)
VALUES (
  4663,
  '0x39dbed3a2bd333467115de45665cc57f813c4571',
  'chain',
  'pons',
  'PONS',
  'Pons',
  18,
  'https://coin-images.coingecko.com/coins/images/102174571/large/jhitvkisdq8fhxvimdkpcw7y3dx5.?1784093932',
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
  "chain_id", "address", "candidate_enabled", "candidate_rank", "logo_url",
  "created_at", "updated_at"
)
VALUES (
  4663,
  '0x39dbed3a2bd333467115de45665cc57f813c4571',
  true,
  19,
  'https://coin-images.coingecko.com/coins/images/102174571/large/jhitvkisdq8fhxvimdkpcw7y3dx5.?1784093932',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("chain_id", "address") DO UPDATE SET
  "candidate_enabled" = true,
  "candidate_rank" = EXCLUDED."candidate_rank",
  "logo_url" = EXCLUDED."logo_url",
  "updated_at" = CURRENT_TIMESTAMP;

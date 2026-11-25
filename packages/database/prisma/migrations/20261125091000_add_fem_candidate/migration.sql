-- FEM is the Femeora token launched on Robinhood Chain. Store it as curated
-- product data so the candidate catalog can offer FEM/USDG before a canonical
-- Femeora liquidity pool exists.
INSERT INTO "asset_catalog" (
  "chain_id", "address", "source", "source_asset_id", "symbol", "name",
  "decimals", "logo_url", "category", "isin", "status",
  "current_multiplier", "market_status", "extended_status",
  "overnight_status", "source_updated_at", "created_at", "updated_at"
)
VALUES (
  4663,
  '0x6f6a3a9b30f783ef9f9f8651e49b797b8c2aa117',
  'chain',
  'femeora',
  'FEM',
  'Femeora',
  18,
  'https://femeora.tech/fomeora-logo.png',
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
  '0x6f6a3a9b30f783ef9f9f8651e49b797b8c2aa117',
  true,
  20,
  'https://femeora.tech/fomeora-logo.png',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("chain_id", "address") DO UPDATE SET
  "candidate_enabled" = true,
  "candidate_rank" = EXCLUDED."candidate_rank",
  "logo_url" = EXCLUDED."logo_url",
  "updated_at" = CURRENT_TIMESTAMP;

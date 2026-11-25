-- FEM trades on the public Pons curve against WETH. GeckoTerminal can return
-- the base-token OHLC in USD, which is the correct reference denomination for
-- the canonical FEM/USDG pool. Pool trades remain separate and are never
-- fabricated by this source.
UPDATE "asset_display_configs"
SET
  "candidate_quote_address" = '0x5fc5360d0400a0fd4f2af552add042d716f1d168',
  "updated_at" = NOW()
WHERE
  "chain_id" = 4663
  AND "address" = '0x6f6a3a9b30f783ef9f9f8651e49b797b8c2aa117';

INSERT INTO "asset_price_sources" (
  "id", "chain_id", "token_address", "source_type", "feed_address", "symbol",
  "quote_currency", "heartbeat_seconds", "priority", "enabled", "created_at", "updated_at"
)
VALUES (
  gen_random_uuid(),
  4663,
  '0x6f6a3a9b30f783ef9f9f8651e49b797b8c2aa117',
  'GECKOTERMINAL',
  '0x2aef0c3ad996d46dcfd379accdd0553470173f01',
  'FEM/USDG',
  'USD',
  120,
  20,
  TRUE,
  NOW(),
  NOW()
)
ON CONFLICT ("chain_id", "token_address", "source_type") DO UPDATE SET
  "feed_address" = EXCLUDED."feed_address",
  "symbol" = EXCLUDED."symbol",
  "quote_currency" = EXCLUDED."quote_currency",
  "heartbeat_seconds" = EXCLUDED."heartbeat_seconds",
  "priority" = EXCLUDED."priority",
  "enabled" = TRUE,
  "updated_at" = NOW();

INSERT INTO "asset_price_sources" (
  "id", "chain_id", "token_address", "source_type", "feed_address", "symbol",
  "quote_currency", "heartbeat_seconds", "priority", "enabled", "created_at", "updated_at"
)
VALUES (
  gen_random_uuid(),
  4663,
  '0xe8ffd7e24187f72afb08d75b1bb13088a989a791',
  'GECKOTERMINAL',
  '0xd64fbda67e1015df43fa5e49f02ca844729e5f94',
  'DELTA/WETH',
  'WETH',
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

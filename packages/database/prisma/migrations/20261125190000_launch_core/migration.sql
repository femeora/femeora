CREATE TABLE "launchpads" (
  "chain_id" INTEGER NOT NULL,
  "launchpad_id" BIGINT NOT NULL,
  "owner" VARCHAR(42) NOT NULL,
  "fee_recipient" VARCHAR(42) NOT NULL,
  "admins" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "name" VARCHAR(120) NOT NULL,
  "slug" VARCHAR(80) NOT NULL,
  "metadata_uri" TEXT NOT NULL,
  "domain" VARCHAR(255) NOT NULL,
  "x_handle" VARCHAR(64) NOT NULL,
  "quote_token" VARCHAR(42) NOT NULL,
  "trade_fee_pips" INTEGER NOT NULL,
  "creator_share_pips" INTEGER NOT NULL,
  "launchpad_share_pips" INTEGER NOT NULL,
  "protocol_share_pips" INTEGER NOT NULL,
  "lp_creator_share_pips" INTEGER NOT NULL,
  "lp_launchpad_share_pips" INTEGER NOT NULL,
  "lp_protocol_share_pips" INTEGER NOT NULL,
  "graduation_threshold" DECIMAL(78,0) NOT NULL,
  "curve_token_supply" DECIMAL(78,0) NOT NULL,
  "graduation_target" VARCHAR(12) NOT NULL,
  "start_fee_pips" INTEGER NOT NULL,
  "end_fee_pips" INTEGER NOT NULL,
  "fee_duration_seconds" INTEGER NOT NULL,
  "fee_curve" VARCHAR(16) NOT NULL,
  "protection_enabled" BOOLEAN NOT NULL,
  "x_required" BOOLEAN NOT NULL,
  "dev_buy_cap_pips" INTEGER NOT NULL,
  "early_buy_cap_pips" INTEGER NOT NULL,
  "early_buy_duration_seconds" INTEGER NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "transaction_hash" VARCHAR(66) NOT NULL,
  "block_number" BIGINT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL,
  "canonical" BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "launchpads_pkey" PRIMARY KEY ("chain_id", "launchpad_id")
);

CREATE TABLE "launches" (
  "chain_id" INTEGER NOT NULL,
  "launch_id" BIGINT NOT NULL,
  "launchpad_id" BIGINT NOT NULL,
  "creator" VARCHAR(42) NOT NULL,
  "token" VARCHAR(42) NOT NULL,
  "curve" VARCHAR(42) NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "symbol" VARCHAR(32) NOT NULL,
  "metadata_uri" TEXT NOT NULL,
  "total_supply" DECIMAL(78,0) NOT NULL,
  "quote_reserve" DECIMAL(78,0) NOT NULL DEFAULT 0,
  "token_inventory" DECIMAL(78,0) NOT NULL,
  "progress_pips" INTEGER NOT NULL DEFAULT 0,
  "status" VARCHAR(20) NOT NULL DEFAULT 'curve',
  "transaction_hash" VARCHAR(66) NOT NULL,
  "block_number" BIGINT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL,
  "canonical" BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "launches_pkey" PRIMARY KEY ("chain_id", "launch_id")
);

CREATE TABLE "launchpad_status_events" (
  "chain_id" INTEGER NOT NULL,
  "transaction_hash" VARCHAR(66) NOT NULL,
  "log_index" INTEGER NOT NULL,
  "launchpad_id" BIGINT NOT NULL,
  "active" BOOLEAN NOT NULL,
  "block_number" BIGINT NOT NULL,
  "timestamp" TIMESTAMP(3) NOT NULL,
  "canonical" BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "launchpad_status_events_pkey" PRIMARY KEY ("chain_id", "transaction_hash", "log_index")
);

CREATE TABLE "curve_trades" (
  "chain_id" INTEGER NOT NULL,
  "transaction_hash" VARCHAR(66) NOT NULL,
  "log_index" INTEGER NOT NULL,
  "launch_id" BIGINT NOT NULL,
  "side" VARCHAR(8) NOT NULL,
  "trader" VARCHAR(42) NOT NULL,
  "recipient" VARCHAR(42) NOT NULL,
  "quote_amount" DECIMAL(78,0) NOT NULL,
  "token_amount" DECIMAL(78,0) NOT NULL,
  "fee_amount" DECIMAL(78,0) NOT NULL,
  "quote_reserve" DECIMAL(78,0) NOT NULL,
  "token_inventory" DECIMAL(78,0) NOT NULL,
  "progress_pips" INTEGER NOT NULL,
  "block_number" BIGINT NOT NULL,
  "timestamp" TIMESTAMP(3) NOT NULL,
  "canonical" BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "curve_trades_pkey" PRIMARY KEY ("chain_id", "transaction_hash", "log_index")
);

CREATE TABLE "graduations" (
  "chain_id" INTEGER NOT NULL,
  "launch_id" BIGINT NOT NULL,
  "pool" VARCHAR(42) NOT NULL,
  "position_id" BIGINT NOT NULL,
  "token_amount" DECIMAL(78,0) NOT NULL,
  "quote_amount" DECIMAL(78,0) NOT NULL,
  "transaction_hash" VARCHAR(66) NOT NULL,
  "block_number" BIGINT NOT NULL,
  "timestamp" TIMESTAMP(3) NOT NULL,
  "canonical" BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "graduations_pkey" PRIMARY KEY ("chain_id", "launch_id")
);

CREATE TABLE "launchpad_revenue" (
  "chain_id" INTEGER NOT NULL,
  "transaction_hash" VARCHAR(66) NOT NULL,
  "log_index" INTEGER NOT NULL,
  "launch_id" BIGINT NOT NULL,
  "recipient" VARCHAR(42) NOT NULL,
  "category" VARCHAR(20) NOT NULL,
  "token" VARCHAR(42) NOT NULL,
  "amount" DECIMAL(78,0) NOT NULL,
  "block_number" BIGINT NOT NULL,
  "timestamp" TIMESTAMP(3) NOT NULL,
  "canonical" BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "launchpad_revenue_pkey" PRIMARY KEY ("chain_id", "transaction_hash", "log_index", "category")
);

CREATE TABLE "protected_token_identities" (
  "chain_id" INTEGER NOT NULL,
  "token" VARCHAR(42) NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "symbol" VARCHAR(32) NOT NULL,
  "official_x_id" TEXT NOT NULL,
  "verified_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "protected_token_identities_pkey" PRIMARY KEY ("chain_id", "token")
);

CREATE UNIQUE INDEX "launchpads_chain_id_slug_key" ON "launchpads"("chain_id", "slug");
CREATE INDEX "launchpads_chain_id_owner_active_idx" ON "launchpads"("chain_id", "owner", "active");
CREATE INDEX "launchpad_status_events_chain_id_launchpad_id_block_number_idx" ON "launchpad_status_events"("chain_id", "launchpad_id", "block_number");
CREATE UNIQUE INDEX "launches_chain_id_token_key" ON "launches"("chain_id", "token");
CREATE UNIQUE INDEX "launches_chain_id_curve_key" ON "launches"("chain_id", "curve");
CREATE INDEX "launches_chain_id_launchpad_id_created_at_idx" ON "launches"("chain_id", "launchpad_id", "created_at");
CREATE INDEX "launches_chain_id_status_created_at_idx" ON "launches"("chain_id", "status", "created_at");
CREATE INDEX "curve_trades_chain_id_launch_id_timestamp_idx" ON "curve_trades"("chain_id", "launch_id", "timestamp");
CREATE UNIQUE INDEX "graduations_chain_id_pool_key" ON "graduations"("chain_id", "pool");
CREATE UNIQUE INDEX "graduations_chain_id_position_id_key" ON "graduations"("chain_id", "position_id");
CREATE INDEX "launchpad_revenue_chain_id_launch_id_timestamp_idx" ON "launchpad_revenue"("chain_id", "launch_id", "timestamp");
CREATE INDEX "launchpad_revenue_chain_id_recipient_timestamp_idx" ON "launchpad_revenue"("chain_id", "recipient", "timestamp");
CREATE INDEX "protected_token_identities_chain_id_symbol_idx" ON "protected_token_identities"("chain_id", "symbol");
CREATE INDEX "protected_token_identities_official_x_id_idx" ON "protected_token_identities"("official_x_id");

ALTER TABLE "launches" ADD CONSTRAINT "launches_chain_id_launchpad_id_fkey"
  FOREIGN KEY ("chain_id", "launchpad_id") REFERENCES "launchpads"("chain_id", "launchpad_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "launchpad_status_events" ADD CONSTRAINT "launchpad_status_events_chain_id_launchpad_id_fkey"
  FOREIGN KEY ("chain_id", "launchpad_id") REFERENCES "launchpads"("chain_id", "launchpad_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "curve_trades" ADD CONSTRAINT "curve_trades_chain_id_launch_id_fkey"
  FOREIGN KEY ("chain_id", "launch_id") REFERENCES "launches"("chain_id", "launch_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "graduations" ADD CONSTRAINT "graduations_chain_id_launch_id_fkey"
  FOREIGN KEY ("chain_id", "launch_id") REFERENCES "launches"("chain_id", "launch_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "launchpad_revenue" ADD CONSTRAINT "launchpad_revenue_chain_id_launch_id_fkey"
  FOREIGN KEY ("chain_id", "launch_id") REFERENCES "launches"("chain_id", "launch_id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "callouts" ADD COLUMN "kind" VARCHAR(20) NOT NULL DEFAULT 'position';
ALTER TABLE "callouts" ADD COLUMN "launch_id" BIGINT;
CREATE INDEX "callouts_chain_id_launch_id_idx" ON "callouts"("chain_id", "launch_id");

-- Launch data is served exclusively by the authenticated Femeora API. Keep the
-- database service role as the only application-level access path, consistent
-- with the rest of the indexed protocol tables.
ALTER TABLE "launchpads" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "launches" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "launchpad_status_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "curve_trades" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "graduations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "launchpad_revenue" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "protected_token_identities" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "launchpads" FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE "launches" FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE "launchpad_status_events" FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE "curve_trades" FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE "graduations" FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE "launchpad_revenue" FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE "protected_token_identities" FROM PUBLIC, anon, authenticated;

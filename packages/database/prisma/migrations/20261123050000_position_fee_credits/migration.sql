ALTER TABLE "bin_fee_accruals"
    ADD COLUMN "transaction_index" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "position_share_checkpoints" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "chain_id" INTEGER NOT NULL,
    "position_id" BIGINT NOT NULL,
    "pool_id" UUID NOT NULL,
    "transaction_hash" VARCHAR(66) NOT NULL,
    "transaction_index" INTEGER NOT NULL,
    "log_index" INTEGER NOT NULL,
    "block_number" BIGINT NOT NULL,
    "block_hash" VARCHAR(66) NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "bin_id" INTEGER NOT NULL,
    "shares" DECIMAL(78,0) NOT NULL,
    "canonical" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "position_share_checkpoints_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "position_share_checkpoints_position_fkey" FOREIGN KEY ("chain_id", "position_id") REFERENCES "positions"("chain_id", "id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "position_share_checkpoints_pool_fkey" FOREIGN KEY ("pool_id") REFERENCES "pools"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "position_share_checkpoints_chain_tx_log_bin_key"
    ON "position_share_checkpoints"("chain_id", "transaction_hash", "log_index", "bin_id");
CREATE INDEX "position_share_checkpoints_position_bin_block_idx"
    ON "position_share_checkpoints"("chain_id", "position_id", "bin_id", "block_number");
CREATE INDEX "position_share_checkpoints_pool_bin_block_canonical_idx"
    ON "position_share_checkpoints"("pool_id", "bin_id", "block_number", "canonical");

CREATE TABLE "position_fee_credits" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "accrual_id" UUID NOT NULL,
    "chain_id" INTEGER NOT NULL,
    "position_id" BIGINT NOT NULL,
    "pool_id" UUID NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "token_in" VARCHAR(42) NOT NULL,
    "amount_raw" DECIMAL(78,0) NOT NULL,
    "amount_quote" DECIMAL(36,18),
    "canonical" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "position_fee_credits_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "position_fee_credits_accrual_fkey" FOREIGN KEY ("accrual_id") REFERENCES "bin_fee_accruals"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "position_fee_credits_position_fkey" FOREIGN KEY ("chain_id", "position_id") REFERENCES "positions"("chain_id", "id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "position_fee_credits_pool_fkey" FOREIGN KEY ("pool_id") REFERENCES "pools"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "position_fee_credits_accrual_chain_position_key"
    ON "position_fee_credits"("accrual_id", "chain_id", "position_id");
CREATE INDEX "position_fee_credits_position_timestamp_canonical_idx"
    ON "position_fee_credits"("chain_id", "position_id", "timestamp", "canonical");
CREATE INDEX "position_fee_credits_pool_timestamp_canonical_idx"
    ON "position_fee_credits"("pool_id", "timestamp", "canonical");

ALTER TABLE "position_share_checkpoints" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "position_fee_credits" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "position_share_checkpoints" FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE "position_fee_credits" FROM PUBLIC, anon, authenticated;

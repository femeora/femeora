CREATE TABLE "tail_rewards" (
    "chain_id" INTEGER NOT NULL,
    "transaction_hash" VARCHAR(66) NOT NULL,
    "log_index" INTEGER NOT NULL,
    "block_number" BIGINT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "token" VARCHAR(42) NOT NULL,
    "referrer" VARCHAR(42) NOT NULL,
    "referrer_position_id" BIGINT NOT NULL,
    "treasury_amount" DECIMAL(78,0) NOT NULL,
    "reward_amount" DECIMAL(78,0) NOT NULL,
    "eligible" BOOLEAN NOT NULL,
    "canonical" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "tail_rewards_pkey" PRIMARY KEY ("chain_id", "transaction_hash", "log_index")
);

CREATE INDEX "tail_rewards_chain_id_referrer_position_id_canonical_idx"
    ON "tail_rewards"("chain_id", "referrer_position_id", "canonical");
CREATE INDEX "tail_rewards_chain_id_referrer_canonical_idx"
    ON "tail_rewards"("chain_id", "referrer", "canonical");
CREATE INDEX "tail_rewards_chain_id_block_number_canonical_idx"
    ON "tail_rewards"("chain_id", "block_number", "canonical");

ALTER TABLE "tail_rewards" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "tail_rewards" FROM PUBLIC, anon, authenticated;

-- The mainnet Tail Fee upgrade and canonical-pool replacements were executed
-- before the indexer release that understands DlmmPoolReplaced and
-- TailFeesDistributed. Replaying from the first upgrade block is idempotent:
-- all projections use their canonical event identities as upsert keys.
UPDATE "chain_cursors"
SET
    "next_block" = 123676300,
    "last_processed_block" = 123676299,
    "last_processed_hash" = NULL,
    "updated_at" = CURRENT_TIMESTAMP
WHERE "chain_id" = 4663
  AND "next_block" > 123676300;

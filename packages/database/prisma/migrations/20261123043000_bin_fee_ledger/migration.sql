CREATE TABLE "bin_fee_accruals" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "chain_id" INTEGER NOT NULL,
    "pool_id" UUID NOT NULL,
    "transaction_hash" VARCHAR(66) NOT NULL,
    "log_index" INTEGER NOT NULL,
    "block_number" BIGINT NOT NULL,
    "block_hash" VARCHAR(66) NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "bin_id" INTEGER NOT NULL,
    "token_in" VARCHAR(42) NOT NULL,
    "lp_fee" DECIMAL(78,0) NOT NULL,
    "total_shares" DECIMAL(78,0) NOT NULL,
    "canonical" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "bin_fee_accruals_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "bin_fee_accruals_pool_id_fkey" FOREIGN KEY ("pool_id") REFERENCES "pools"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "bin_fee_accruals_chain_id_transaction_hash_log_index_key"
    ON "bin_fee_accruals"("chain_id", "transaction_hash", "log_index");
CREATE INDEX "bin_fee_accruals_pool_id_bin_id_block_number_idx"
    ON "bin_fee_accruals"("pool_id", "bin_id", "block_number");
CREATE INDEX "bin_fee_accruals_chain_id_block_number_canonical_idx"
    ON "bin_fee_accruals"("chain_id", "block_number", "canonical");

ALTER TABLE "bin_fee_accruals" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "bin_fee_accruals" FROM PUBLIC, anon, authenticated;

-- CreateTable
CREATE TABLE "pools" (
    "id" UUID NOT NULL,
    "chain_id" INTEGER NOT NULL,
    "address" VARCHAR(42) NOT NULL,
    "type" VARCHAR(10) NOT NULL,
    "token_x" TEXT NOT NULL,
    "token_y" TEXT NOT NULL,
    "quote_token" TEXT NOT NULL,
    "bin_step" INTEGER NOT NULL,
    "base_fee_bps" INTEGER NOT NULL,
    "created_block" BIGINT NOT NULL,

    CONSTRAINT "pools_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chain_cursors" (
    "chain_id" INTEGER NOT NULL,
    "next_block" BIGINT NOT NULL,
    "last_processed_block" BIGINT,
    "last_processed_hash" VARCHAR(66),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chain_cursors_pkey" PRIMARY KEY ("chain_id")
);

-- CreateTable
CREATE TABLE "canonical_blocks" (
    "chain_id" INTEGER NOT NULL,
    "block_number" BIGINT NOT NULL,
    "hash" VARCHAR(66) NOT NULL,
    "parent_hash" VARCHAR(66) NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "canonical" BOOLEAN NOT NULL DEFAULT true,
    "processed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "canonical_blocks_pkey" PRIMARY KEY ("chain_id","block_number")
);

-- CreateTable
CREATE TABLE "bins" (
    "pool_id" UUID NOT NULL,
    "bin_id" INTEGER NOT NULL,
    "reserve_x" DECIMAL(78,0) NOT NULL,
    "reserve_y" DECIMAL(78,0) NOT NULL,
    "total_shares" DECIMAL(78,0) NOT NULL,
    "updated_block" BIGINT NOT NULL,

    CONSTRAINT "bins_pkey" PRIMARY KEY ("pool_id","bin_id")
);

-- CreateTable
CREATE TABLE "swaps" (
    "id" UUID NOT NULL,
    "chain_id" INTEGER NOT NULL,
    "pool_id" UUID NOT NULL,
    "transaction_hash" VARCHAR(66) NOT NULL,
    "log_index" INTEGER NOT NULL,
    "block_number" BIGINT NOT NULL,
    "block_hash" VARCHAR(66) NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "sender" VARCHAR(42) NOT NULL,
    "recipient" VARCHAR(42) NOT NULL,
    "token_in" VARCHAR(42) NOT NULL,
    "amount_in" DECIMAL(78,0) NOT NULL,
    "amount_out" DECIMAL(78,0) NOT NULL,
    "total_fee" DECIMAL(78,0) NOT NULL DEFAULT 0,
    "protocol_fee" DECIMAL(78,0) NOT NULL DEFAULT 0,
    "active_bin_before" INTEGER,
    "active_bin_after" INTEGER,
    "bin_crossings" INTEGER,
    "canonical" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "swaps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candles" (
    "pool_id" UUID NOT NULL,
    "interval" VARCHAR(8) NOT NULL,
    "bucket_start" TIMESTAMP(3) NOT NULL,
    "open" DECIMAL(78,18) NOT NULL,
    "high" DECIMAL(78,18) NOT NULL,
    "low" DECIMAL(78,18) NOT NULL,
    "close" DECIMAL(78,18) NOT NULL,
    "volume_x" DECIMAL(78,0) NOT NULL DEFAULT 0,
    "volume_y" DECIMAL(78,0) NOT NULL DEFAULT 0,
    "swap_count" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "candles_pkey" PRIMARY KEY ("pool_id","interval","bucket_start")
);

-- CreateTable
CREATE TABLE "positions" (
    "id" BIGINT NOT NULL,
    "chain_id" INTEGER NOT NULL,
    "pool_id" UUID NOT NULL,
    "owner" VARCHAR(42) NOT NULL,
    "lower_bin" INTEGER NOT NULL,
    "upper_bin" INTEGER NOT NULL,
    "shape" SMALLINT NOT NULL,
    "tag" VARCHAR(66),
    "referrer" VARCHAR(42),
    "status" VARCHAR(20) NOT NULL,
    "deposited_quote" DECIMAL(36,18) NOT NULL DEFAULT 0,
    "withdrawn_quote" DECIMAL(36,18) NOT NULL DEFAULT 0,
    "earned_quote" DECIMAL(36,18) NOT NULL DEFAULT 0,
    "value_quote" DECIMAL(36,18) NOT NULL DEFAULT 0,
    "in_range_seconds" BIGINT NOT NULL DEFAULT 0,
    "open_seconds" BIGINT NOT NULL DEFAULT 0,
    "opened_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMP(3),

    CONSTRAINT "positions_pkey" PRIMARY KEY ("chain_id","id")
);

-- CreateTable
CREATE TABLE "position_bins" (
    "chain_id" INTEGER NOT NULL,
    "position_id" BIGINT NOT NULL,
    "bin_id" INTEGER NOT NULL,
    "shares" DECIMAL(78,0) NOT NULL,

    CONSTRAINT "position_bins_pkey" PRIMARY KEY ("chain_id","position_id","bin_id")
);

-- CreateTable
CREATE TABLE "position_events" (
    "chain_id" INTEGER NOT NULL,
    "transaction_hash" VARCHAR(66) NOT NULL,
    "log_index" INTEGER NOT NULL,
    "position_id" BIGINT NOT NULL,
    "block_number" BIGINT NOT NULL,
    "block_hash" VARCHAR(66) NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "event_type" VARCHAR(40) NOT NULL,
    "owner" VARCHAR(42),
    "canonical" BOOLEAN NOT NULL DEFAULT true,
    "payload" JSONB NOT NULL,

    CONSTRAINT "position_events_pkey" PRIMARY KEY ("chain_id","transaction_hash","log_index")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "x_id" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "name" TEXT,
    "avatar_url" TEXT,
    "x_verified" BOOLEAN NOT NULL DEFAULT false,
    "x_followers" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "banned" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallets" (
    "address" VARCHAR(42) NOT NULL,
    "user_id" UUID NOT NULL,
    "linked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verified_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallets_pkey" PRIMARY KEY ("address")
);

-- CreateTable
CREATE TABLE "callouts" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "chain_id" INTEGER NOT NULL,
    "position_id" BIGINT NOT NULL,
    "pool_id" UUID NOT NULL,
    "caption" VARCHAR(280),
    "caption_edited_at" TIMESTAMP(3),
    "show_size" BOOLEAN NOT NULL DEFAULT true,
    "deleted_at" TIMESTAMP(3),
    "mc_at_post" DECIMAL(36,18) NOT NULL,
    "price_at_post" DECIMAL(36,18) NOT NULL,
    "size_at_post" DECIMAL(36,18) NOT NULL,
    "side" VARCHAR(30) NOT NULL,
    "shape" SMALLINT NOT NULL,
    "lower_bin" INTEGER NOT NULL,
    "upper_bin" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" VARCHAR(20) NOT NULL,
    "hidden" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "callouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tails" (
    "callout_id" UUID NOT NULL,
    "chain_id" INTEGER NOT NULL,
    "position_id" BIGINT NOT NULL,
    "tailer_user_id" UUID,
    "tailer_wallet" VARCHAR(42) NOT NULL,
    "mode" VARCHAR(30) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tails_pkey" PRIMARY KEY ("chain_id","position_id")
);

-- CreateTable
CREATE TABLE "likes" (
    "user_id" UUID NOT NULL,
    "callout_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "likes_pkey" PRIMARY KEY ("user_id","callout_id")
);

-- CreateTable
CREATE TABLE "reposts" (
    "user_id" UUID NOT NULL,
    "callout_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reposts_pkey" PRIMARY KEY ("user_id","callout_id")
);

-- CreateTable
CREATE TABLE "replies" (
    "id" UUID NOT NULL,
    "callout_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "parent_id" UUID,
    "body" VARCHAR(280) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "hidden" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "replies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_stats" (
    "user_id" UUID NOT NULL,
    "window" VARCHAR(10) NOT NULL,
    "callouts" INTEGER NOT NULL DEFAULT 0,
    "earned_quote" DECIMAL(36,18) NOT NULL DEFAULT 0,
    "avg_in_range" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "tailers" INTEGER NOT NULL DEFAULT 0,
    "quick_exits" INTEGER NOT NULL DEFAULT 0,
    "score" DECIMAL(36,18) NOT NULL DEFAULT 0,
    "rank" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_stats_pkey" PRIMARY KEY ("user_id","window")
);

-- CreateIndex
CREATE UNIQUE INDEX "pools_chain_id_address_key" ON "pools"("chain_id", "address");

-- CreateIndex
CREATE INDEX "canonical_blocks_chain_id_canonical_block_number_idx" ON "canonical_blocks"("chain_id", "canonical", "block_number");

-- CreateIndex
CREATE UNIQUE INDEX "canonical_blocks_chain_id_hash_key" ON "canonical_blocks"("chain_id", "hash");

-- CreateIndex
CREATE INDEX "swaps_pool_id_timestamp_idx" ON "swaps"("pool_id", "timestamp");

-- CreateIndex
CREATE INDEX "swaps_chain_id_block_number_canonical_idx" ON "swaps"("chain_id", "block_number", "canonical");

-- CreateIndex
CREATE UNIQUE INDEX "swaps_chain_id_transaction_hash_log_index_key" ON "swaps"("chain_id", "transaction_hash", "log_index");

-- CreateIndex
CREATE INDEX "candles_pool_id_interval_bucket_start_idx" ON "candles"("pool_id", "interval", "bucket_start");

-- CreateIndex
CREATE INDEX "positions_owner_idx" ON "positions"("owner");

-- CreateIndex
CREATE INDEX "positions_pool_id_idx" ON "positions"("pool_id");

-- CreateIndex
CREATE INDEX "position_bins_chain_id_bin_id_idx" ON "position_bins"("chain_id", "bin_id");

-- CreateIndex
CREATE INDEX "position_events_chain_id_position_id_block_number_idx" ON "position_events"("chain_id", "position_id", "block_number");

-- CreateIndex
CREATE INDEX "position_events_chain_id_block_number_canonical_idx" ON "position_events"("chain_id", "block_number", "canonical");

-- CreateIndex
CREATE UNIQUE INDEX "users_x_id_key" ON "users"("x_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_handle_key" ON "users"("handle");

-- CreateIndex
CREATE INDEX "wallets_user_id_idx" ON "wallets"("user_id");

-- CreateIndex
CREATE INDEX "callouts_user_id_idx" ON "callouts"("user_id");

-- CreateIndex
CREATE INDEX "callouts_pool_id_idx" ON "callouts"("pool_id");

-- CreateIndex
CREATE UNIQUE INDEX "callouts_chain_id_position_id_key" ON "callouts"("chain_id", "position_id");

-- CreateIndex
CREATE INDEX "tails_callout_id_idx" ON "tails"("callout_id");

-- AddForeignKey
ALTER TABLE "bins" ADD CONSTRAINT "bins_pool_id_fkey" FOREIGN KEY ("pool_id") REFERENCES "pools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "swaps" ADD CONSTRAINT "swaps_pool_id_fkey" FOREIGN KEY ("pool_id") REFERENCES "pools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candles" ADD CONSTRAINT "candles_pool_id_fkey" FOREIGN KEY ("pool_id") REFERENCES "pools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "positions" ADD CONSTRAINT "positions_pool_id_fkey" FOREIGN KEY ("pool_id") REFERENCES "pools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "position_bins" ADD CONSTRAINT "position_bins_chain_id_position_id_fkey" FOREIGN KEY ("chain_id", "position_id") REFERENCES "positions"("chain_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "position_events" ADD CONSTRAINT "position_events_chain_id_position_id_fkey" FOREIGN KEY ("chain_id", "position_id") REFERENCES "positions"("chain_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "callouts" ADD CONSTRAINT "callouts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "callouts" ADD CONSTRAINT "callouts_pool_id_fkey" FOREIGN KEY ("pool_id") REFERENCES "pools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "callouts" ADD CONSTRAINT "callouts_chain_id_position_id_fkey" FOREIGN KEY ("chain_id", "position_id") REFERENCES "positions"("chain_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tails" ADD CONSTRAINT "tails_callout_id_fkey" FOREIGN KEY ("callout_id") REFERENCES "callouts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "likes" ADD CONSTRAINT "likes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "likes" ADD CONSTRAINT "likes_callout_id_fkey" FOREIGN KEY ("callout_id") REFERENCES "callouts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reposts" ADD CONSTRAINT "reposts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reposts" ADD CONSTRAINT "reposts_callout_id_fkey" FOREIGN KEY ("callout_id") REFERENCES "callouts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "replies" ADD CONSTRAINT "replies_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "replies" ADD CONSTRAINT "replies_callout_id_fkey" FOREIGN KEY ("callout_id") REFERENCES "callouts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_stats" ADD CONSTRAINT "user_stats_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

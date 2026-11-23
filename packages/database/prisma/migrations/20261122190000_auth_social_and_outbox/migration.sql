-- AlterTable
ALTER TABLE "position_events" DROP CONSTRAINT "position_events_pkey",
ADD COLUMN     "id" UUID NOT NULL,
ADD CONSTRAINT "position_events_pkey" PRIMARY KEY ("id");

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oauth_states" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "state_hash" CHAR(64) NOT NULL,
    "redirect_path" VARCHAR(512),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),

    CONSTRAINT "oauth_states_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallet_link_challenges" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "wallet_address" VARCHAR(42) NOT NULL,
    "nonce_hash" CHAR(64) NOT NULL,
    "message_hash" VARCHAR(66) NOT NULL,
    "chain_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),

    CONSTRAINT "wallet_link_challenges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "callout_intents" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "chain_id" INTEGER NOT NULL,
    "pool_id" UUID NOT NULL,
    "caption" VARCHAR(280),
    "tag" VARCHAR(66) NOT NULL,
    "kind" VARCHAR(20) NOT NULL DEFAULT 'callout',
    "mode" VARCHAR(30),
    "referrer" VARCHAR(42),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),

    CONSTRAINT "callout_intents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "callout_updates" (
    "id" UUID NOT NULL,
    "callout_id" UUID NOT NULL,
    "position_event_id" UUID NOT NULL,
    "caption" VARCHAR(280),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "callout_updates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "follows" (
    "follower_id" UUID NOT NULL,
    "followee_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "follows_pkey" PRIMARY KEY ("follower_id","followee_id")
);

-- CreateTable
CREATE TABLE "views_daily" (
    "callout_id" UUID NOT NULL,
    "day" DATE NOT NULL,
    "viewer_hash" CHAR(64) NOT NULL,

    CONSTRAINT "views_daily_pkey" PRIMARY KEY ("callout_id","day","viewer_hash")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "actor_user_id" UUID,
    "type" VARCHAR(40) NOT NULL,
    "entity_type" VARCHAR(40),
    "entity_id" VARCHAR(128),
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "read_at" TIMESTAMP(3),

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reports" (
    "id" UUID NOT NULL,
    "reporter_id" UUID NOT NULL,
    "type" VARCHAR(40) NOT NULL,
    "target_id" VARCHAR(128) NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'open',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox_events" (
    "id" BIGSERIAL NOT NULL,
    "topic" VARCHAR(80) NOT NULL,
    "aggregate_id" VARCHAR(128),
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published_at" TIMESTAMP(3),

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");

-- CreateIndex
CREATE INDEX "sessions_user_id_expires_at_idx" ON "sessions"("user_id", "expires_at");

-- CreateIndex
CREATE INDEX "sessions_expires_at_idx" ON "sessions"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "oauth_states_state_hash_key" ON "oauth_states"("state_hash");

-- CreateIndex
CREATE INDEX "oauth_states_expires_at_consumed_at_idx" ON "oauth_states"("expires_at", "consumed_at");

-- CreateIndex
CREATE UNIQUE INDEX "wallet_link_challenges_nonce_hash_key" ON "wallet_link_challenges"("nonce_hash");

-- CreateIndex
CREATE INDEX "wallet_link_challenges_user_id_expires_at_idx" ON "wallet_link_challenges"("user_id", "expires_at");

-- CreateIndex
CREATE INDEX "wallet_link_challenges_wallet_address_consumed_at_idx" ON "wallet_link_challenges"("wallet_address", "consumed_at");

-- CreateIndex
CREATE UNIQUE INDEX "callout_intents_tag_key" ON "callout_intents"("tag");

-- CreateIndex
CREATE INDEX "callout_intents_user_id_expires_at_idx" ON "callout_intents"("user_id", "expires_at");

-- CreateIndex
CREATE INDEX "callout_intents_chain_id_pool_id_expires_at_idx" ON "callout_intents"("chain_id", "pool_id", "expires_at");

-- CreateIndex
CREATE INDEX "callout_updates_callout_id_created_at_idx" ON "callout_updates"("callout_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "callout_updates_position_event_id_key" ON "callout_updates"("position_event_id");

-- CreateIndex
CREATE INDEX "follows_followee_id_created_at_idx" ON "follows"("followee_id", "created_at");

-- CreateIndex
CREATE INDEX "notifications_user_id_read_at_created_at_idx" ON "notifications"("user_id", "read_at", "created_at");

-- CreateIndex
CREATE INDEX "reports_status_created_at_idx" ON "reports"("status", "created_at");

-- CreateIndex
CREATE INDEX "reports_type_target_id_idx" ON "reports"("type", "target_id");

-- CreateIndex
CREATE INDEX "outbox_events_published_at_id_idx" ON "outbox_events"("published_at", "id");

-- CreateIndex
CREATE INDEX "outbox_events_topic_id_idx" ON "outbox_events"("topic", "id");

-- CreateIndex
CREATE UNIQUE INDEX "position_events_chain_id_transaction_hash_log_index_key" ON "position_events"("chain_id", "transaction_hash", "log_index");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oauth_states" ADD CONSTRAINT "oauth_states_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_link_challenges" ADD CONSTRAINT "wallet_link_challenges_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "callout_intents" ADD CONSTRAINT "callout_intents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "callout_intents" ADD CONSTRAINT "callout_intents_pool_id_fkey" FOREIGN KEY ("pool_id") REFERENCES "pools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "callout_updates" ADD CONSTRAINT "callout_updates_callout_id_fkey" FOREIGN KEY ("callout_id") REFERENCES "callouts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "callout_updates" ADD CONSTRAINT "callout_updates_position_event_id_fkey" FOREIGN KEY ("position_event_id") REFERENCES "position_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follows" ADD CONSTRAINT "follows_follower_id_fkey" FOREIGN KEY ("follower_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follows" ADD CONSTRAINT "follows_followee_id_fkey" FOREIGN KEY ("followee_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "views_daily" ADD CONSTRAINT "views_daily_callout_id_fkey" FOREIGN KEY ("callout_id") REFERENCES "callouts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

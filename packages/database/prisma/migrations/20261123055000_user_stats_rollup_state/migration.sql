ALTER TABLE "indexer_health"
    ADD COLUMN "last_stats_rollup_at" TIMESTAMPTZ;

ALTER TABLE "callouts"
    ADD COLUMN "quick_exit_minutes" INTEGER,
    ADD COLUMN "has_opposite_side" BOOLEAN,
    ADD COLUMN "is_fresh_wallet" BOOLEAN,
    ADD COLUMN "is_dev_or_top_holder" BOOLEAN,
    ADD CONSTRAINT "callouts_quick_exit_minutes_check"
        CHECK ("quick_exit_minutes" IS NULL OR "quick_exit_minutes" BETWEEN 0 AND 30);

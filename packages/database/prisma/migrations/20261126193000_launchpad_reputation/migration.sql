CREATE TABLE "launchpad_reputations" (
    "chain_id" INTEGER NOT NULL,
    "launchpad_id" BIGINT NOT NULL,
    "window" VARCHAR(10) NOT NULL,
    "launches" INTEGER NOT NULL DEFAULT 0,
    "eligible_launches" INTEGER NOT NULL DEFAULT 0,
    "graduations" INTEGER NOT NULL DEFAULT 0,
    "survived_graduations" INTEGER NOT NULL DEFAULT 0,
    "graduation_rate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "survival_rate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "median_time_to_graduate" BIGINT,
    "dev_exit_rate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "sniper_share" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "volume_quote" DECIMAL(36,18) NOT NULL DEFAULT 0,
    "revenue_quote" DECIMAL(36,18) NOT NULL DEFAULT 0,
    "protection_score" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "score" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "tier" VARCHAR(12) NOT NULL DEFAULT 'Unrated',
    "computed_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "launchpad_reputations_pkey" PRIMARY KEY ("chain_id", "launchpad_id", "window")
);

CREATE INDEX "launchpad_reputations_chain_id_window_score_idx"
ON "launchpad_reputations"("chain_id", "window", "score");

CREATE INDEX "launchpad_reputations_chain_id_window_revenue_quote_idx"
ON "launchpad_reputations"("chain_id", "window", "revenue_quote");

ALTER TABLE "launchpad_reputations"
ADD CONSTRAINT "launchpad_reputations_chain_id_launchpad_id_fkey"
FOREIGN KEY ("chain_id", "launchpad_id") REFERENCES "launchpads"("chain_id", "launchpad_id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "indexer_health"
ADD COLUMN "last_reputation_rollup_at" TIMESTAMP(3);

-- Reputation is derived by the indexer and served only through the Femeora API.
ALTER TABLE "launchpad_reputations" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "launchpad_reputations" FROM PUBLIC, anon, authenticated;

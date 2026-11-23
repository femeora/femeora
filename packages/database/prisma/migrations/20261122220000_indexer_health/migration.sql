CREATE TABLE "indexer_health" (
    "chain_id" INTEGER NOT NULL,
    "status" VARCHAR(20) NOT NULL,
    "latest_block" BIGINT NOT NULL,
    "safe_block" BIGINT NOT NULL,
    "last_indexed_block" BIGINT,
    "lag_blocks" BIGINT NOT NULL,
    "last_success_at" TIMESTAMP(3),
    "last_error_code" VARCHAR(80),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "indexer_health_pkey" PRIMARY KEY ("chain_id")
);

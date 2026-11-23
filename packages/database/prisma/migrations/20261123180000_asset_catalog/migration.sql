CREATE TABLE "asset_catalog" (
  "chain_id" INTEGER NOT NULL,
  "address" VARCHAR(42) NOT NULL,
  "source" VARCHAR(20) NOT NULL,
  "source_asset_id" VARCHAR(80),
  "symbol" VARCHAR(64) NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "decimals" INTEGER NOT NULL,
  "logo_url" TEXT,
  "category" VARCHAR(20) NOT NULL,
  "isin" VARCHAR(32),
  "status" VARCHAR(64) NOT NULL,
  "current_multiplier" VARCHAR(80),
  "market_status" VARCHAR(64),
  "extended_status" VARCHAR(64),
  "overnight_status" VARCHAR(64),
  "source_updated_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "asset_catalog_pkey" PRIMARY KEY ("chain_id", "address")
);

CREATE INDEX "asset_catalog_chain_id_category_status_idx"
  ON "asset_catalog"("chain_id", "category", "status");

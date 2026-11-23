-- Callout creation is driven by an on-chain tag. Valuation snapshots remain unknown
-- until the quote asset and valuation job are configured; never fabricate zero values.
ALTER TABLE "callouts" ALTER COLUMN "mc_at_post" DROP NOT NULL;
ALTER TABLE "callouts" ALTER COLUMN "price_at_post" DROP NOT NULL;
ALTER TABLE "callouts" ALTER COLUMN "size_at_post" DROP NOT NULL;
ALTER TABLE "callouts" ALTER COLUMN "side" DROP NOT NULL;

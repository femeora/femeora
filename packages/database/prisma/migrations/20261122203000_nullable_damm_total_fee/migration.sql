-- DAMM Swap events expose protocolFee but not totalFee; keep unknown values distinct from zero.
ALTER TABLE "swaps" ALTER COLUMN "total_fee" DROP DEFAULT;
ALTER TABLE "swaps" ALTER COLUMN "total_fee" DROP NOT NULL;

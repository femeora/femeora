-- Quote-token classification is configured independently from permissionless pool creation.
ALTER TABLE "pools" ALTER COLUMN "quote_token" DROP NOT NULL;

-- PoolFactory emits feePips; retain its full precision instead of rounding to basis points.
ALTER TABLE "pools" RENAME COLUMN "base_fee_bps" TO "base_fee_pips";

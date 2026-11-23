ALTER TABLE "pools"
    ADD COLUMN "last_value_refresh_at" TIMESTAMPTZ;

ALTER TABLE "positions"
    ALTER COLUMN "value_quote" DROP DEFAULT,
    ALTER COLUMN "value_quote" DROP NOT NULL,
    ADD COLUMN "value_quote_updated_at" TIMESTAMPTZ,
    ADD COLUMN "value_quote_block" BIGINT;

-- Previous zeroes were schema defaults, not authoritative valuations.
UPDATE "positions"
SET "value_quote" = NULL;

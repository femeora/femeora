ALTER TABLE "positions"
ADD COLUMN "opening_quote" DECIMAL(36,18) NOT NULL DEFAULT 0;

UPDATE "positions"
SET "opening_quote" = "deposited_quote";

ALTER TABLE "position_events"
ADD COLUMN "cash_flow_type" VARCHAR(16),
ADD COLUMN "amount_quote" DECIMAL(36,18);

CREATE INDEX "position_events_chain_id_position_id_cash_flow_type_canonical_idx"
ON "position_events"("chain_id", "position_id", "cash_flow_type", "canonical");

ALTER TABLE "pools" ADD COLUMN "canonical" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "positions" ADD COLUMN "canonical" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "callouts" ADD COLUMN "canonical" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "outbox_events" ADD COLUMN "chain_id" INTEGER;
ALTER TABLE "outbox_events" ADD COLUMN "block_number" BIGINT;
ALTER TABLE "outbox_events" ADD COLUMN "canonical" BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX "outbox_events_chain_id_block_number_canonical_idx"
ON "outbox_events"("chain_id", "block_number", "canonical");

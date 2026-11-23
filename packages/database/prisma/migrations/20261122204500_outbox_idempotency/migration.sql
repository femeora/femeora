-- Event-derived outbox writes must remain idempotent when a block range is replayed.
ALTER TABLE "outbox_events" ADD COLUMN "dedup_key" VARCHAR(180);
UPDATE "outbox_events" SET "dedup_key" = 'legacy:' || "id"::text WHERE "dedup_key" IS NULL;
ALTER TABLE "outbox_events" ALTER COLUMN "dedup_key" SET NOT NULL;
CREATE UNIQUE INDEX "outbox_events_dedup_key_key" ON "outbox_events"("dedup_key");

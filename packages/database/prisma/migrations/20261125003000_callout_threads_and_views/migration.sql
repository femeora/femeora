ALTER TABLE "replies"
ADD COLUMN "kind" VARCHAR(16) NOT NULL DEFAULT 'reply';

CREATE INDEX "replies_callout_id_kind_created_at_idx"
ON "replies"("callout_id", "kind", "created_at");

DROP INDEX IF EXISTS "replies_callout_id_created_at_idx";

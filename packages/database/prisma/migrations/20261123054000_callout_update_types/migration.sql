ALTER TABLE "callout_updates"
    ADD COLUMN "type" VARCHAR(20);

UPDATE "callout_updates" AS update_row
SET "type" = CASE position_event.event_type
    WHEN 'increased' THEN 'Added'
    WHEN 'decreased' THEN 'Removed'
    WHEN 'closed' THEN 'Closed'
    ELSE 'Rebalanced'
END
FROM "position_events" AS position_event
WHERE position_event.id = update_row.position_event_id;

ALTER TABLE "callout_updates"
    ALTER COLUMN "type" SET NOT NULL,
    ADD CONSTRAINT "callout_updates_type_check"
        CHECK ("type" IN ('Added', 'Removed', 'Rebalanced', 'Closed'));

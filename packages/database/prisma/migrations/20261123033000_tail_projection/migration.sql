ALTER TABLE pools ADD COLUMN active_bin INTEGER;
ALTER TABLE callout_intents ADD COLUMN source_callout_id UUID;

ALTER TABLE callout_intents
ADD CONSTRAINT callout_intents_source_callout_id_fkey
FOREIGN KEY (source_callout_id) REFERENCES callouts(id)
ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX callout_intents_source_callout_id_expires_at_idx
ON callout_intents(source_callout_id, expires_at);

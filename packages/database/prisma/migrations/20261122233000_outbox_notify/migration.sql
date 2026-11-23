-- PostgreSQL delivers NOTIFY messages only after the surrounding transaction commits.
-- The payload contains only the public event id; durable payloads remain in the table.
CREATE OR REPLACE FUNCTION notify_fomeora_outbox_event()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM pg_notify('fomeora_outbox', NEW.id::text);
  RETURN NEW;
END;
$$;

CREATE TRIGGER outbox_events_notify_after_insert
AFTER INSERT ON outbox_events
FOR EACH ROW
EXECUTE FUNCTION notify_fomeora_outbox_event();

CREATE INDEX outbox_events_canonical_chain_id_id_idx
ON outbox_events(canonical, chain_id, id);

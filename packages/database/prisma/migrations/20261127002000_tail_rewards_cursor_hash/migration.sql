-- Complete the intentional mainnet replay cursor with the canonical hash of
-- block 123676299. The indexer verifies this hash before reading block
-- 123676300, preventing replay from starting on an orphaned chain segment.
UPDATE "chain_cursors"
SET
    "last_processed_hash" = '0x3850aff3ab4a52901f3bea5cc8676630ab2c5481cc6b6249d1d1ae701adc5d9a',
    "updated_at" = CURRENT_TIMESTAMP
WHERE "chain_id" = 4663
  AND "next_block" = 123676300
  AND "last_processed_block" = 123676299
  AND "last_processed_hash" IS NULL;

ALTER TABLE position_bins ADD COLUMN pool_id UUID;

UPDATE position_bins AS position_bin
SET pool_id = position.pool_id
FROM positions AS position
WHERE position.chain_id = position_bin.chain_id
  AND position.id = position_bin.position_id;

ALTER TABLE position_bins ALTER COLUMN pool_id SET NOT NULL;

ALTER TABLE position_bins
ADD CONSTRAINT position_bins_pool_id_fkey
FOREIGN KEY (pool_id) REFERENCES pools(id)
ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX position_bins_pool_id_bin_id_idx
ON position_bins(pool_id, bin_id);

CREATE INDEX callouts_created_at_idx
ON callouts(created_at);

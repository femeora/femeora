ALTER TABLE "pools"
ADD COLUMN "reserve_x" DECIMAL(78, 0),
ADD COLUMN "reserve_y" DECIMAL(78, 0),
ADD COLUMN "reserve_updated_block" BIGINT,
ADD COLUMN "last_reserve_refresh_at" TIMESTAMP(3);

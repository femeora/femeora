ALTER TABLE "pools"
    ADD COLUMN "token_x_decimals" INTEGER,
    ADD COLUMN "token_y_decimals" INTEGER;

ALTER TABLE "pools"
    ADD CONSTRAINT "pools_token_x_decimals_check"
        CHECK ("token_x_decimals" IS NULL OR "token_x_decimals" BETWEEN 0 AND 36),
    ADD CONSTRAINT "pools_token_y_decimals_check"
        CHECK ("token_y_decimals" IS NULL OR "token_y_decimals" BETWEEN 0 AND 36);

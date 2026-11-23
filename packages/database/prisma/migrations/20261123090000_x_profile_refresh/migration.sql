ALTER TABLE "users"
    ADD COLUMN "x_profile_refreshed_at" TIMESTAMP(3);

CREATE INDEX "users_x_profile_refreshed_at_idx"
    ON "users"("x_profile_refreshed_at");

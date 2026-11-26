CREATE TABLE "launchpad_likes" (
  "user_id" UUID NOT NULL,
  "chain_id" INTEGER NOT NULL,
  "launchpad_id" BIGINT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "launchpad_likes_pkey" PRIMARY KEY ("user_id", "chain_id", "launchpad_id"),
  CONSTRAINT "launchpad_likes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "launchpad_likes_chain_id_launchpad_id_fkey" FOREIGN KEY ("chain_id", "launchpad_id") REFERENCES "launchpads"("chain_id", "launchpad_id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "launchpad_likes_chain_id_launchpad_id_created_at_idx" ON "launchpad_likes"("chain_id", "launchpad_id", "created_at");

CREATE TABLE "launchpad_reposts" (
  "user_id" UUID NOT NULL,
  "chain_id" INTEGER NOT NULL,
  "launchpad_id" BIGINT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "launchpad_reposts_pkey" PRIMARY KEY ("user_id", "chain_id", "launchpad_id"),
  CONSTRAINT "launchpad_reposts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "launchpad_reposts_chain_id_launchpad_id_fkey" FOREIGN KEY ("chain_id", "launchpad_id") REFERENCES "launchpads"("chain_id", "launchpad_id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "launchpad_reposts_chain_id_launchpad_id_created_at_idx" ON "launchpad_reposts"("chain_id", "launchpad_id", "created_at");

CREATE TABLE "launchpad_replies" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "chain_id" INTEGER NOT NULL,
  "launchpad_id" BIGINT NOT NULL,
  "user_id" UUID NOT NULL,
  "parent_id" UUID,
  "kind" VARCHAR(16) NOT NULL DEFAULT 'reply',
  "body" VARCHAR(280) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "hidden" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "launchpad_replies_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "launchpad_replies_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "launchpad_replies_chain_id_launchpad_id_fkey" FOREIGN KEY ("chain_id", "launchpad_id") REFERENCES "launchpads"("chain_id", "launchpad_id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "launchpad_replies_chain_id_launchpad_id_kind_created_at_idx" ON "launchpad_replies"("chain_id", "launchpad_id", "kind", "created_at");
CREATE INDEX "launchpad_replies_parent_id_idx" ON "launchpad_replies"("parent_id");

CREATE TABLE "launchpad_views_daily" (
  "chain_id" INTEGER NOT NULL,
  "launchpad_id" BIGINT NOT NULL,
  "day" DATE NOT NULL,
  "viewer_hash" CHAR(64) NOT NULL,
  CONSTRAINT "launchpad_views_daily_pkey" PRIMARY KEY ("chain_id", "launchpad_id", "day", "viewer_hash"),
  CONSTRAINT "launchpad_views_daily_chain_id_launchpad_id_fkey" FOREIGN KEY ("chain_id", "launchpad_id") REFERENCES "launchpads"("chain_id", "launchpad_id") ON DELETE CASCADE ON UPDATE CASCADE
);

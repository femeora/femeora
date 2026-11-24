-- Candidate ordering and presentation overrides are product data, not web
-- source constants. The table intentionally has no FK so configuration can be
-- prepared before the external asset catalog's first refresh.
CREATE TABLE "asset_display_configs" (
  "chain_id" INTEGER NOT NULL,
  "address" VARCHAR(42) NOT NULL,
  "candidate_enabled" BOOLEAN NOT NULL DEFAULT true,
  "candidate_rank" INTEGER,
  "logo_url" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "asset_display_configs_pkey" PRIMARY KEY ("chain_id", "address")
);

CREATE INDEX "asset_display_configs_chain_id_candidate_enabled_candidate_rank_idx"
  ON "asset_display_configs"("chain_id", "candidate_enabled", "candidate_rank");

ALTER TABLE "asset_display_configs" ENABLE ROW LEVEL SECURITY;

INSERT INTO "asset_display_configs"
  ("chain_id", "address", "candidate_enabled", "candidate_rank", "logo_url", "updated_at")
VALUES
  (4663, '0x4a0e65a3eccec6dbe60ae065f2e7bb85fae35eea', true, 1, 'https://cdn.simpleicons.org/spacex/000000', CURRENT_TIMESTAMP),
  (4663, '0xe93237c50d904957cf27e7b1133b510c669c2e74', true, 2, NULL, CURRENT_TIMESTAMP),
  (4663, '0xd0601ce157db5bdc3162bbac2a2c8af5320d9eec', true, 3, NULL, CURRENT_TIMESTAMP),
  (4663, '0xaf3d76f1834a1d425780943c99ea8a608f8a93f9', true, 4, NULL, CURRENT_TIMESTAMP),
  (4663, '0x322f0929c4625ed5bad873c95208d54e1c003b2d', true, 5, NULL, CURRENT_TIMESTAMP),
  (4663, '0x12f190a9f9d7d37a250758b26824b97ce941bf54', true, 6, NULL, CURRENT_TIMESTAMP),
  (4663, '0x2e0847e8910a9732eb3fb1bb4b70a580adad4fe3', true, 7, NULL, CURRENT_TIMESTAMP),
  (4663, '0xc0d6457c16cc70d6790dd43521c899c87ce02f35', true, 8, NULL, CURRENT_TIMESTAMP),
  (4663, '0x86923f96303d656e4aa86d9d42d1e57ad2023fdc', true, 9, NULL, CURRENT_TIMESTAMP),
  (4663, '0x156e175dd063a8ce274c50654ef40e0032b3fbcf', true, 10, NULL, CURRENT_TIMESTAMP),
  (4663, '0xe0444ef8bf4ed74f74fd73686e2ddf4c1c5591e8', true, 11, NULL, CURRENT_TIMESTAMP),
  (4663, '0x117cc2133c37b721f49de2a7a74833232b3b4c0c', true, 12, NULL, CURRENT_TIMESTAMP),
  (4663, '0xd5f3879160bc7c32ebb4dc785f8a4f505888de68', true, 13, NULL, CURRENT_TIMESTAMP),
  (4663, '0xb8dbf92f9741c9ac1c32115e78581f23509916fd', true, 14, NULL, CURRENT_TIMESTAMP),
  (4663, '0xbbb6c29bcc3a1028a2b54310df73f4f7a3bcb373', true, 15, 'https://cdn.simpleicons.org/anthropic/191919', CURRENT_TIMESTAMP),
  (4663, '0x3139d77ace0cbaa5bdfd38bd1f1911a794af0b0e', true, 16, NULL, CURRENT_TIMESTAMP),
  (4663, '0x1af6446f07eb1d97c546afc8c9544cbdf3ad5137', true, 17, NULL, CURRENT_TIMESTAMP),
  (4663, '0x03bc731ffb162cdd7b98d3c6542bfc291126075d', true, 18, NULL, CURRENT_TIMESTAMP);

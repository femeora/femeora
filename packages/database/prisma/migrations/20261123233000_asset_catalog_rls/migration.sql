-- Asset metadata is served exclusively through the Fomeora API.
-- Keep direct browser/database roles closed by default, matching the rest of
-- the application schema.
ALTER TABLE "asset_catalog" ENABLE ROW LEVEL SECURITY;

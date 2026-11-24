-- Robinhood NCW token images frequently represent the wrapper rather than the
-- underlying company. Keep exceptional brand fallbacks as database-managed
-- presentation data; ticker logos remain the primary web source.
UPDATE "asset_display_configs" AS config
SET "logo_url" = override."logo_url",
    "updated_at" = CURRENT_TIMESTAMP
FROM (VALUES
  ('0x4a0e65a3eccec6dbe60ae065f2e7bb85fae35eea', 'https://www.google.com/s2/favicons?domain=spacex.com&sz=128'),
  ('0xb8dbf92f9741c9ac1c32115e78581f23509916fd', 'https://www.google.com/s2/favicons?domain=applieddigital.com&sz=128'),
  ('0xbbb6c29bcc3a1028a2b54310df73f4f7a3bcb373', 'https://www.google.com/s2/favicons?domain=anthropic.com&sz=128'),
  ('0x3139d77ace0cbaa5bdfd38bd1f1911a794af0b0e', 'https://www.google.com/s2/favicons?domain=abcellera.com&sz=128'),
  ('0x03bc731ffb162cdd7b98d3c6542bfc291126075d', 'https://www.google.com/s2/favicons?domain=fireflyspace.com&sz=128')
) AS override("address", "logo_url")
WHERE config."chain_id" = 4663
  AND config."address" = override."address";

-- A saved delivery address must be a real destination.
--
-- An address with no pin cannot take part in serviceability: it cannot be
-- checked for coverage, cannot anchor a feed, and cannot receive food. It was
-- nevertheless a legal row, and the frontend covered for one by quietly falling
-- back to whatever point was in the location cookie — answering for a place the
-- customer had not chosen.
--
-- No backfill: this table is empty in every environment the change ships to,
-- and there is no coordinate to invent for a row that never had one. Should a
-- pinless row exist anywhere, this statement FAILS rather than guessing, which
-- is the outcome we want — the address would have to be pinned or removed by
-- hand first.
ALTER TABLE "ConsumerAddress" ALTER COLUMN "latitude" SET NOT NULL,
ALTER COLUMN "longitude" SET NOT NULL;

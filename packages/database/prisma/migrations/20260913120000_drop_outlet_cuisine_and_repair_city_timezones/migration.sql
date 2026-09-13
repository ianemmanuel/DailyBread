-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Drop OutletCuisine — dead, never written.
--
-- Zero rows and zero references anywhere outside the generated Prisma client
-- (grep-verified across every app and package), exactly like OutletServiceArea
-- before it. Nothing ever wrote a row, so every outlet has had an empty cuisine
-- list since the table was created, and any consumer reading it was reading a
-- value that never reflected reality.
--
-- A cuisine is already said in two places that ARE written: VendorProfileCuisine
-- (what this business cooks) and MenuItemCuisine (what this dish is). An
-- outlet-level third copy would be a fourth thing to keep in sync and the one
-- most likely to go stale — a branch's tags quietly disagreeing with the dishes
-- it actually sells.
--
-- Discovery now DERIVES an outlet's cuisines from the vendor's profile plus the
-- cuisines of the dishes that outlet genuinely offers, which is strictly more
-- accurate than a tag somebody forgot to update and needs no writer at all.
-- ═══════════════════════════════════════════════════════════════════════════
DROP TABLE IF EXISTS "OutletCuisine";

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Repair city timezones that do not belong to their own country.
--
-- Found in live data: BOTH Kenyan cities were stored as 'Africa/Addis_Ababa'.
-- Nothing visibly misbehaved because Addis Ababa and Nairobi are both UTC+3 —
-- which is exactly what makes this class of error dangerous. The same slip
-- between countries on different offsets silently shifts every operating-hours
-- and happy-hour window in that market, and no screen would show it.
--
-- Cause: the admin timezone picker offers all ~420 IANA zones alphabetically
-- and the backend validated nothing. Validation now refuses a timezone that is
-- not one of the country's own (see lib/time/timezone.ts), so this repair is
-- one-off rather than recurring.
--
-- Only repairs where the answer is UNAMBIGUOUS — the country uses exactly one
-- timezone. A country with several cannot be guessed from here; those rows are
-- left alone and the new validation will catch them on the next edit rather
-- than this migration inventing a location for them.
-- ═══════════════════════════════════════════════════════════════════════════
UPDATE "City" AS c
SET    "timezone" = co."timezones"[1]
FROM   "Country" AS co
WHERE  c."countryId" = co."id"
  AND  array_length(co."timezones", 1) = 1
  AND  c."timezone" <> co."timezones"[1];

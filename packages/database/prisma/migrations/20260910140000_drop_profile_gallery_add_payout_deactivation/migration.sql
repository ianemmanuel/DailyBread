-- Two unrelated corrections, one migration.
--
-- 1. Drop the vendor-profile photo gallery and reservation link.
--
-- Both advertise a physical venue, which a delivery-only marketplace has no
-- reason to publish — and for a cloud kitchen (an existing VendorType here) a
-- premises photo is a disclosure the vendor may not have intended. Uber Eats,
-- DoorDash and Bolt Food carry neither field; their imagery is a logo, a cover
-- and per-dish photography, and a reservation link only makes sense for
-- dine-in, which this platform does not sell.
--
-- The gallery shipped earlier the same day and no vendor has used it. The
-- objects it could have referenced live under the profile-media/gallery/
-- prefix in R2; nothing points at them any more, so that prefix can be emptied
-- out of band.
--
-- 2. Give a payout account a deactivation trail.
--
-- An account that WAS verified and has since been taken out of service is not
-- a failed verification, so it must not be recorded as one. Mirrors City's
-- deactivatedAt / deactivationReason / deactivatedByAdminId convention.

ALTER TABLE "VendorProfile" DROP COLUMN IF EXISTS "galleryStorageKeys";
ALTER TABLE "VendorProfile" DROP COLUMN IF EXISTS "reservationLink";

ALTER TABLE "VendorPayoutAccount" ADD COLUMN "deactivatedAt"      TIMESTAMP(3);
ALTER TABLE "VendorPayoutAccount" ADD COLUMN "deactivationReason" TEXT;
ALTER TABLE "VendorPayoutAccount" ADD COLUMN "deactivatedById"    TEXT;

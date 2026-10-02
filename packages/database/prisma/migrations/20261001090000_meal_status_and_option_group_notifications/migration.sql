-- Notifications for the meal moderation actions that had none.
--
-- Suspending, banning or reinstating a meal changed what customers could see
-- without telling the vendor — the dish simply vanished from the marketplace.
-- And a flagged option group (ModifierGroup) had no admin verdict at all, so
-- it gets its own approve / send-back pair here.
--
-- MEAL_REINSTATED covers both lifting a suspension and lifting a ban; the
-- audit log (menu_item.reinstated / menu_item.unbanned) keeps them apart.

ALTER TYPE "VendorNotificationType" ADD VALUE IF NOT EXISTS 'MEAL_SUSPENDED';
ALTER TYPE "VendorNotificationType" ADD VALUE IF NOT EXISTS 'MEAL_BANNED';
ALTER TYPE "VendorNotificationType" ADD VALUE IF NOT EXISTS 'MEAL_REINSTATED';
ALTER TYPE "VendorNotificationType" ADD VALUE IF NOT EXISTS 'MEAL_OPTIONS_APPROVED';
ALTER TYPE "VendorNotificationType" ADD VALUE IF NOT EXISTS 'MEAL_OPTIONS_REJECTED';

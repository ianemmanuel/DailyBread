-- A flagged meal needs somewhere for the flag to go.
--
-- The menu shipped with MenuItem.reviewStatus / flagReasons / rejectionReason
-- and a vendor-facing notice reading "someone will look at it shortly" — but
-- with no admin surface, nothing could ever clear the flag. That is a promise
-- the platform could not keep, so this adds the notification type the
-- send-back-for-revision action needs.
--
-- Named MEAL_* rather than MENU_ITEM_* because that is the word the vendor
-- sees everywhere in their dashboard; the model name is an internal detail.

ALTER TYPE "VendorNotificationType" ADD VALUE IF NOT EXISTS 'MEAL_REJECTED';
ALTER TYPE "VendorNotificationType" ADD VALUE IF NOT EXISTS 'MEAL_APPROVED';

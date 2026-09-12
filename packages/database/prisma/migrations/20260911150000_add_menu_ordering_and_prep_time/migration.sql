-- Menu structure: where a dish sits inside its section, and how long it takes.
--
-- Existing rows all default to position 0, which is correct and not a
-- migration gap: until a vendor arranges their menu, every dish in a section
-- ties and falls back to the name ordering the list already applied.
ALTER TABLE "MenuItem" ADD COLUMN     "position" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "prepTimeMinutes" INTEGER;

-- CreateIndex
CREATE INDEX "MenuItem_sectionId_position_idx" ON "MenuItem"("sectionId", "position");

-- Adds the canonical storage-unit-per-item ratio used to weight a SKU's
-- contribution to its warehouse's used capacity
-- (quantity * "storageUnitsPerItem"), replacing the previous raw-quantity
-- comparison against warehouse.capacity. Existing rows default to 1 (one
-- storage unit per item), which preserves prior capacity semantics for
-- already-seeded data until items are recalibrated through the UI.
ALTER TABLE "inventory_items" ADD COLUMN "storageUnitsPerItem" DECIMAL(12,6) NOT NULL DEFAULT 1;

ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_storage_units_per_item_positive" CHECK ("storageUnitsPerItem" > 0);

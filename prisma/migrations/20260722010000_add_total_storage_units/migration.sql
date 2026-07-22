-- Adds a Postgres-maintained generated column holding the storage units this
-- SKU currently consumes (quantity * storageUnitsPerItem), so the inventory
-- list can sort on it through the normal orderBy path instead of only
-- comparing it within whatever page is loaded client-side. STORED means
-- Postgres recomputes it on every row write, regardless of which code path
-- issued the update (incl. StockMovementService's conditional-update guard).
ALTER TABLE "inventory_items"
  ADD COLUMN "totalStorageUnits" DECIMAL(28,6)
  GENERATED ALWAYS AS ("quantity" * "storageUnitsPerItem") STORED;

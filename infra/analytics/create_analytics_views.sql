-- Storex — BigQuery analytics schema.
--
-- The analytics layer is deliberately NOT a mirror of the OLTP schema: it is
-- a small star-style read model (dimensions + facts + a daily aggregate)
-- built as views over the tables Datastream replicates from Cloud SQL.
--
-- Datastream (BigQuery destination, "single dataset for all schemas" mode)
-- lands the transactional tables as `<RAW_DATASET>.public_<table>`, kept
-- fresh via CDC merges. Views keep the pipeline zero-maintenance: no
-- scheduled jobs, no staleness beyond Datastream's freshness window. If
-- query volume ever justifies it, promote agg_daily_warehouse_flows to a
-- materialized view.
--
-- Usage (bq CLI):
--   sed -e "s/{{PROJECT_ID}}/my-project/g" \
--       -e "s/{{RAW_DATASET}}/storex_raw/g" \
--       -e "s/{{ANALYTICS_DATASET}}/storex_analytics/g" \
--       create_analytics_views.sql | bq query --use_legacy_sql=false

CREATE SCHEMA IF NOT EXISTS `{{PROJECT_ID}}.{{ANALYTICS_DATASET}}`;

-- ---------------------------------------------------------------------------
-- Dimension: warehouses
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW `{{PROJECT_ID}}.{{ANALYTICS_DATASET}}.dim_warehouse` AS
SELECT
  id            AS warehouse_id,
  organizationId AS organization_id,
  name,
  location,
  capacity,
  createdAt     AS created_at
FROM `{{PROJECT_ID}}.{{RAW_DATASET}}.public_warehouses`;

-- ---------------------------------------------------------------------------
-- Fact: current inventory snapshot (one row per SKU per warehouse)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW `{{PROJECT_ID}}.{{ANALYTICS_DATASET}}.fact_inventory_current` AS
SELECT
  i.id             AS inventory_item_id,
  i.organizationId AS organization_id,
  i.warehouseId    AS warehouse_id,
  w.name           AS warehouse_name,
  w.capacity       AS warehouse_capacity,
  i.sku,
  i.name           AS item_name,
  i.quantity,
  i.updatedAt      AS updated_at
FROM `{{PROJECT_ID}}.{{RAW_DATASET}}.public_inventory_items` i
JOIN `{{PROJECT_ID}}.{{RAW_DATASET}}.public_warehouses` w
  ON w.id = i.warehouseId;

-- ---------------------------------------------------------------------------
-- Fact: stock movements (movement grain, denormalized for query convenience)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW `{{PROJECT_ID}}.{{ANALYTICS_DATASET}}.fact_stock_movement` AS
SELECT
  m.id              AS movement_id,
  m.organizationId  AS organization_id,
  m.warehouseId     AS warehouse_id,
  w.name            AS warehouse_name,
  m.inventoryItemId AS inventory_item_id,
  i.sku,
  i.name            AS item_name,
  m.type,
  m.quantity,
  m.note,
  m.createdById     AS created_by_id,
  m.occurredAt      AS occurred_at
FROM `{{PROJECT_ID}}.{{RAW_DATASET}}.public_stock_movements` m
JOIN `{{PROJECT_ID}}.{{RAW_DATASET}}.public_warehouses` w
  ON w.id = m.warehouseId
JOIN `{{PROJECT_ID}}.{{RAW_DATASET}}.public_inventory_items` i
  ON i.id = m.inventoryItemId;

-- ---------------------------------------------------------------------------
-- Aggregate: daily inbound/outbound per warehouse (trend queries)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW `{{PROJECT_ID}}.{{ANALYTICS_DATASET}}.agg_daily_warehouse_flows` AS
SELECT
  organization_id,
  warehouse_id,
  warehouse_name,
  DATE(occurred_at)                          AS day,
  SUM(IF(type = 'INBOUND',  quantity, 0))    AS inbound_units,
  SUM(IF(type = 'OUTBOUND', quantity, 0))    AS outbound_units,
  COUNT(*)                                   AS movement_count
FROM `{{PROJECT_ID}}.{{ANALYTICS_DATASET}}.fact_stock_movement`
GROUP BY 1, 2, 3, 4;

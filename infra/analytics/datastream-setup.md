# CDC pipeline: Cloud SQL → Datastream → BigQuery

Storex separates OLTP (Cloud SQL PostgreSQL) from OLAP (BigQuery). The
dashboard reads **only** from BigQuery. Replication is handled by
**Google Cloud Datastream** (serverless CDC).

## Why Datastream (trade-offs)

| Option | Verdict |
| --- | --- |
| **Datastream CDC** (chosen) | Managed, serverless, exactly-once merges into BigQuery, no application code involved — the app cannot forget to sync. Freshness is configurable (seconds–minutes), which is fine for analytics. |
| Dual-write from the service layer | Rejected: couples OLTP writes to BigQuery availability and inevitably drifts (partial failures, replays, backfills). |
| Scheduled export (batch ELT) | Rejected: hours-stale dashboards, full-table scans on the OLTP database, more moving parts to operate. |
| Pub/Sub + Dataflow | Overkill at this scale; keep it in mind if transformation needs outgrow SQL views. |

Known limitation: Datastream freshness means the dashboard can trail the
transactional truth by up to the configured staleness window. That is the
accepted OLAP trade-off; transactional screens (inventory, movements) read
from Postgres and are always current.

## 1. Prepare Cloud SQL for logical replication

```bash
gcloud sql instances patch storex-pg \
  --database-flags=cloudsql.logical_decoding=on
# (restarts the instance)
```

Then, connected to the `storex` database as the admin user:

```sql
-- Dedicated replication user for Datastream
CREATE USER datastream_user WITH LOGIN PASSWORD 'CHANGE_ME';
ALTER USER datastream_user WITH REPLICATION;
GRANT USAGE ON SCHEMA public TO datastream_user;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO datastream_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO datastream_user;

-- Publication limited to the tables analytics needs
CREATE PUBLICATION datastream_publication FOR TABLE
  public.organizations,
  public.warehouses,
  public.inventory_items,
  public.stock_movements;

SELECT PG_CREATE_LOGICAL_REPLICATION_SLOT('datastream_slot', 'pgoutput');
```

> `users` is intentionally excluded: the dashboard needs no PII, so the
> analytics surface simply never contains it (data-minimization by design).

## 2. Connection profiles

```bash
gcloud services enable datastream.googleapis.com

# Source: Cloud SQL PostgreSQL. For production prefer Private Service
# Connect; the public-IP + allowlist path is the quickest to demo:
# allowlist the regional Datastream IPs on the Cloud SQL instance first
# (https://cloud.google.com/datastream/docs/ip-allowlists-and-regions).
gcloud datastream connection-profiles create storex-pg-source \
  --location=europe-west1 \
  --type=postgresql \
  --display-name="Storex Cloud SQL" \
  --postgresql-hostname=<CLOUD_SQL_PUBLIC_IP> \
  --postgresql-port=5432 \
  --postgresql-database=storex \
  --postgresql-username=datastream_user \
  --postgresql-password=CHANGE_ME \
  --static-ip-connectivity

# Destination: BigQuery
gcloud datastream connection-profiles create storex-bq-dest \
  --location=europe-west1 \
  --type=bigquery \
  --display-name="Storex BigQuery"
```

## 3. The stream

```bash
gcloud datastream streams create storex-cdc \
  --location=europe-west1 \
  --display-name="Storex OLTP → BigQuery" \
  --source=storex-pg-source \
  --postgresql-source-config=postgresql-source.json \
  --destination=storex-bq-dest \
  --bigquery-destination-config=bigquery-dest.json \
  --backfill-all
```

`postgresql-source.json`:

```json
{
  "publication": "datastream_publication",
  "replicationSlot": "datastream_slot",
  "includeObjects": {
    "postgresqlSchemas": [
      {
        "schema": "public",
        "postgresqlTables": [
          { "table": "organizations" },
          { "table": "warehouses" },
          { "table": "inventory_items" },
          { "table": "stock_movements" }
        ]
      }
    ]
  }
}
```

`bigquery-dest.json` (single dataset, merge mode, 5-minute freshness):

```json
{
  "singleTargetDataset": { "datasetId": "PROJECT_ID:storex_raw" },
  "dataFreshness": "300s"
}
```

Start it:

```bash
gcloud datastream streams update storex-cdc --location=europe-west1 --state=RUNNING --update-mask=state
```

Tables appear in `storex_raw` as `public_<table>` and stay current via CDC
merges (including deletes).

## 4. Analytics schema

Create the read-model views the application queries:

```bash
sed -e "s/{{PROJECT_ID}}/$PROJECT_ID/g" \
    -e "s/{{RAW_DATASET}}/storex_raw/g" \
    -e "s/{{ANALYTICS_DATASET}}/storex_analytics/g" \
    infra/analytics/create_analytics_views.sql | bq query --use_legacy_sql=false
```

## 5. Application configuration

| Variable | Value |
| --- | --- |
| `ANALYTICS_SOURCE` | `bigquery` |
| `GCP_PROJECT_ID` | your project id |
| `BIGQUERY_DATASET` | `storex_analytics` |

The Cloud Run service account needs `roles/bigquery.jobUser` on the project
and `roles/bigquery.dataViewer` on **both** datasets (views authorize against
the underlying raw tables).

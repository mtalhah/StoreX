#!/usr/bin/env bash
# One-time GCP provisioning for Storex.
# Idempotent-ish: safe to re-run; existing resources error harmlessly.
set -euo pipefail

: "${PROJECT_ID:?Set PROJECT_ID}"
REGION="${REGION:-europe-west1}"
SQL_INSTANCE="${SQL_INSTANCE:-storex-pg}"
DB_NAME="${DB_NAME:-storex}"
DB_USER="${DB_USER:-storex}"

gcloud config set project "$PROJECT_ID"

echo "==> Enabling APIs"
gcloud services enable \
  run.googleapis.com \
  sqladmin.googleapis.com \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  secretmanager.googleapis.com \
  bigquery.googleapis.com \
  datastream.googleapis.com

echo "==> Artifact Registry"
gcloud artifacts repositories create storex \
  --repository-format=docker --location="$REGION" \
  --description="Storex images" || true

echo "==> Cloud SQL (PostgreSQL 16)"
gcloud sql instances create "$SQL_INSTANCE" \
  --database-version=POSTGRES_16 \
  --region="$REGION" \
  --tier=db-g1-small \
  --storage-size=10GB \
  --database-flags=cloudsql.logical_decoding=on || true
gcloud sql databases create "$DB_NAME" --instance="$SQL_INSTANCE" || true

DB_PASSWORD="$(openssl rand -base64 24)"
gcloud sql users create "$DB_USER" --instance="$SQL_INSTANCE" --password="$DB_PASSWORD" || true

echo "==> BigQuery datasets"
bq --location="$REGION" mk --dataset "$PROJECT_ID:storex_raw" || true
bq --location="$REGION" mk --dataset "$PROJECT_ID:storex_analytics" || true

echo "==> Secrets (placeholders where noted — update WorkOS values!)"
create_secret() {
  local name="$1" value="$2"
  printf '%s' "$value" | gcloud secrets create "$name" --data-file=- 2>/dev/null ||
    printf '%s' "$value" | gcloud secrets versions add "$name" --data-file=-
}
create_secret storex-database-url \
  "postgresql://$DB_USER:$DB_PASSWORD@localhost/$DB_NAME?host=/cloudsql/$PROJECT_ID:$REGION:$SQL_INSTANCE"
create_secret storex-workos-api-key "REPLACE_ME"
create_secret storex-workos-client-id "REPLACE_ME"
create_secret storex-workos-cookie-password "$(openssl rand -base64 32)"
create_secret storex-workos-redirect-uri "https://REPLACE_WITH_CLOUD_RUN_URL/api/auth/callback"

echo "==> IAM for the default compute service account (Cloud Run runtime)"
SA="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')-compute@developer.gserviceaccount.com"
for role in roles/cloudsql.client roles/bigquery.jobUser roles/secretmanager.secretAccessor; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:$SA" --role="$role" --condition=None >/dev/null
done
for ds in storex_raw storex_analytics; do
  bq update --dataset \
    --source <(bq show --format=prettyjson "$PROJECT_ID:$ds" |
      python3 -c "import json,sys; d=json.load(sys.stdin); d['access'].append({'role':'READER','userByEmail':'$SA'}); print(json.dumps(d))") \
    "$PROJECT_ID:$ds" || echo "Grant BigQuery dataViewer on $ds to $SA manually."
done

cat <<EOF

Done. Next steps:
  1. Update the WorkOS secrets with real values from https://dashboard.workos.com
  2. Deploy:   gcloud builds submit --config cloudbuild.yaml \\
                 --substitutions=_REGION=$REGION,_SQL_INSTANCE=$PROJECT_ID:$REGION:$SQL_INSTANCE
  3. Set the WorkOS redirect URI to https://<cloud-run-url>/api/auth/callback
     (both in the WorkOS dashboard and the storex-workos-redirect-uri secret).
  4. Wire up CDC: see infra/analytics/datastream-setup.md
EOF

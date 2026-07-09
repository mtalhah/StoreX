import { BigQuery } from '@google-cloud/bigquery';

/**
 * Process-wide BigQuery client. Authentication uses Application Default
 * Credentials: the Cloud Run service account in production, or
 * GOOGLE_APPLICATION_CREDENTIALS locally.
 */
const globalForBq = globalThis as unknown as { bigquery?: BigQuery };

export const bigquery: BigQuery =
  globalForBq.bigquery ?? new BigQuery({ projectId: process.env.GCP_PROJECT_ID });

if (process.env.NODE_ENV !== 'production') {
  globalForBq.bigquery = bigquery;
}

/** Fully-qualified `project.dataset` prefix for the analytics dataset. */
export function analyticsDataset(): string {
  const project = process.env.GCP_PROJECT_ID;
  const dataset = process.env.BIGQUERY_DATASET ?? 'storex_analytics';
  if (!project) {
    throw new Error('GCP_PROJECT_ID must be set when ANALYTICS_SOURCE=bigquery.');
  }
  return `\`${project}.${dataset}\``;
}

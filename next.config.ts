import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Self-contained server bundle for the Cloud Run Docker image.
  output: 'standalone',
  // Keep gRPC-heavy Google SDKs out of the server bundle; they are loaded
  // from node_modules at runtime instead.
  serverExternalPackages: ['@google-cloud/bigquery'],
};

export default nextConfig;

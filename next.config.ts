import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  experimental: {
    serverActions: {
      // File uploads (connect-doc PDFs, church logos) go through server
      // actions; the 1MB default rejects most real documents.
      bodySizeLimit: '10mb',
    },
  },
};

// Sentry wrapping is a no-op at runtime without a DSN; source-map upload
// only happens in builds where SENTRY_AUTH_TOKEN + org/project are set.
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: true,
  disableLogger: true,
});

import type { NextConfig } from "next";

import {
  STAFF_API_REWRITE_SOURCE,
  staffApiRewriteDestination,
} from "./src/lib/api/api-origin";

const staffApiDestination = staffApiRewriteDestination({
  apiOrigin: process.env.API_ORIGIN,
  nodeEnv: process.env.NODE_ENV,
});

const nextConfig: NextConfig = {
  transpilePackages: ["@valet/ui"],
  turbopack: {
    resolveAlias: {
      "@valet/contracts": "../../packages/contracts/dist/index.js",
    },
  },
  async rewrites() {
    return [
      {
        // Same-origin staff proxy. The path prefix `/v1/staff` is preserved
        // exactly so the backend's httpOnly refresh cookie (Path=/v1/staff/auth)
        // is sent back by the browser on refresh/logout calls.
        source: STAFF_API_REWRITE_SOURCE,
        destination: staffApiDestination,
      },
    ];
  },
};

export default nextConfig;

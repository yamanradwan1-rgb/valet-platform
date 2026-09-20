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
  output: "standalone",
  poweredByHeader: false,
  transpilePackages: ["@valet/ui"],
  turbopack: {
    resolveAlias: {
      "@valet/contracts": "../../packages/contracts/dist/index.js",
    },
  },
  async rewrites() {
    return [
      {
        source: STAFF_API_REWRITE_SOURCE,
        destination: staffApiDestination,
      },
    ];
  },
};

export default nextConfig;

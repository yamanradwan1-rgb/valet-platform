import type { NextConfig } from "next";

import {
  GUEST_API_REWRITE_SOURCE,
  guestApiRewriteDestination,
} from "./src/lib/api/api-origin";

const guestApiDestination = guestApiRewriteDestination({
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
        source: GUEST_API_REWRITE_SOURCE,
        destination: guestApiDestination,
      },
    ];
  },
};

export default nextConfig;

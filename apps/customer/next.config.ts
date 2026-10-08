import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";

import {
  GUEST_API_REWRITE_SOURCE,
  guestApiRewriteDestination,
} from "./src/lib/api/api-origin";

const repositoryRoot = fileURLToPath(new URL("../..", import.meta.url));
const guestApiDestination = guestApiRewriteDestination({
  apiOrigin: process.env.API_ORIGIN,
  nodeEnv: process.env.NODE_ENV,
});

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: repositoryRoot,
  poweredByHeader: false,
  transpilePackages: ["@valet/ui"],
  turbopack: {
    root: repositoryRoot,
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

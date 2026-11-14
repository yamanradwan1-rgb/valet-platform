import type { NextConfig } from "next";
import path from "node:path";
import { staffPublicResetContentSecurityPolicy } from "./src/features/administration/staff/staff-public-reset-document";

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
  async headers() {
    return [{
      source: "/:path*",
      headers: [
        { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(self)" },
      ],
    }, {
      // The standalone reset page strips its fragment before any subresource
      // loads. Keep the route's strict CSP/no-referrer when global headers match.
      source: "/staff/reset-password",
      headers: [
        { key: "Content-Security-Policy", value: staffPublicResetContentSecurityPolicy },
        { key: "Referrer-Policy", value: "no-referrer" },
        { key: "Cache-Control", value: "no-store, max-age=0" },
      ],
    }];
  },
  transpilePackages: ["@valet/ui"],
  // Explicit opt-in for a local isolated worktree preview. Production config is
  // unchanged unless the developer requests this non-deployed preview mode.
  webpack(config) {
    if (process.env.ISSUE_300_LOCAL_PREVIEW !== "1") return config;
    config.resolve.alias = {
      ...(Array.isArray(config.resolve.alias) ? {} : config.resolve.alias),
      "@valet/contracts": path.resolve(process.cwd(), "../../packages/contracts/dist"),
      "@valet/ui": path.resolve(process.cwd(), "../../packages/ui/dist"),
    };
    return config;
  },
  turbopack: {
    // Multiple Git worktrees share a parent directory; never let Next infer
    // the primary checkout as the build root for this release candidate.
    root: path.resolve(process.cwd(), "../.."),
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

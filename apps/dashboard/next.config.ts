import type { NextConfig } from "next";

const apiOrigin = process.env.API_ORIGIN || "http://localhost:3000";

const nextConfig: NextConfig = {
  output: "standalone",
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
        source: "/v1/staff/:path*",
        destination: `${apiOrigin}/v1/staff/:path*`,
      },
    ];
  },
};

export default nextConfig;

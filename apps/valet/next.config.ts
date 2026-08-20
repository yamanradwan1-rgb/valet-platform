import type { NextConfig } from "next";

const apiOrigin = process.env.API_ORIGIN || "http://localhost:3001";

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
        source: "/v1/staff/:path*",
        destination: `${apiOrigin}/v1/staff/:path*`,
      },
    ];
  },
};

export default nextConfig;

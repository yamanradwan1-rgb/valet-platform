import type { NextConfig } from "next";

const apiOrigin = process.env.API_ORIGIN || "http://localhost:3000";

const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: ["@valet/ui", "@valet/contracts"],
  async rewrites() {
    return [
      {
        source: "/api/v1/guest/:path*",
        destination: `${apiOrigin}/v1/guest/:path*`,
      },
    ];
  },
};

export default nextConfig;

import type { NextConfig } from "next";
import {
  EMPLOYEE_STAFF_API_REWRITE_SOURCE,
  employeeStaffApiRewriteDestination,
} from "./src/lib/api/api-origin";

const staffApiDestination = employeeStaffApiRewriteDestination({
  apiOrigin: process.env.API_ORIGIN,
  nodeEnv: process.env.NODE_ENV,
});

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
        source: EMPLOYEE_STAFF_API_REWRITE_SOURCE,
        destination: staffApiDestination,
      },
    ];
  },
};

export default nextConfig;

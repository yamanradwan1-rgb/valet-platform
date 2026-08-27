import { resolveDashboardApiOrigin, staffApiBaseUrl } from "./api-origin";

/**
 * Staff API base URL resolution.
 *
 * Browser requests use the same-origin Next.js rewrite under `/v1/staff/...`.
 * The path prefix must match the backend refresh-cookie Path (`/v1/staff/auth`)
 * exactly so the httpOnly staff refresh cookie is sent back on refresh/logout.
 *
 * Server-side code resolves directly against API_ORIGIN (cookies are not
 * forwarded by the foundation; authenticated reads are client-side).
 */
export const STAFF_API_BROWSER_BASE_PATH = "/v1/staff";

export function getStaffApiBaseUrl(): string {
  if (typeof window !== "undefined") {
    return STAFF_API_BROWSER_BASE_PATH;
  }
  return staffApiBaseUrl(
    resolveDashboardApiOrigin({
      apiOrigin: process.env.API_ORIGIN,
      nodeEnv: process.env.NODE_ENV,
    }),
  );
}

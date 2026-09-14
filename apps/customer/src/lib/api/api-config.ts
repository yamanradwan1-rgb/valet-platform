import { guestApiBaseUrl, resolveCustomerApiOrigin } from "./api-origin";

export const GUEST_API_BROWSER_BASE_PATH = "/api/v1/guest";

export function getGuestApiBaseUrl(): string {
  // In the browser, use the same-origin Next.js proxy route to prevent CORS issues
  if (typeof window !== "undefined") {
    return GUEST_API_BROWSER_BASE_PATH;
  }

  // On the server side (SSR/SSG), resolve to direct API origin
  return guestApiBaseUrl(
    resolveCustomerApiOrigin({
      apiOrigin: process.env.API_ORIGIN,
      nodeEnv: process.env.NODE_ENV,
    }),
  );
}

import type { DashboardApiRequestOptions } from "./dashboard-api-types";

/** Shared path/query encoder for authenticated JSON and binary requests. */
export function buildDashboardApiUrl(
  baseUrl: string,
  path: string,
  query?: DashboardApiRequestOptions["query"],
): string {
  const url = `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
  if (query === undefined) return url;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null)
      params.append(key, String(value));
  }
  const encoded = params.toString();
  return encoded.length === 0 ? url : `${url}?${encoded}`;
}

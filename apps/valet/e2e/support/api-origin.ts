/** Resolve the API endpoint used by real Employee E2E HTTP helpers. */
export function resolveE2eApiOrigin(environment: {
  readonly e2eApiUrl?: string;
  readonly apiOrigin?: string;
}): string {
  const configured =
    environment.e2eApiUrl?.trim() ||
    environment.apiOrigin?.trim() ||
    "http://127.0.0.1:3001";

  let url: URL;
  try {
    url = new URL(configured);
  } catch {
    throw new Error("Employee E2E API origin must be an absolute HTTP(S) URL.");
  }

  if (
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    url.username || url.password || url.pathname !== "/" ||
    url.search || url.hash
  ) {
    throw new Error("Employee E2E API origin must be a bare HTTP(S) origin.");
  }

  // The test API binds IPv4 on some hosts; Node may resolve localhost as ::1.
  // Keep HTTPS hostnames unchanged so local TLS certificate checks still work.
  if (url.protocol === "http:" && url.hostname === "localhost") {
    url.hostname = "127.0.0.1";
  }
  return url.origin;
}

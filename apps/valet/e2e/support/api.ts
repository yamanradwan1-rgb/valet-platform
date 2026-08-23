import { type APIRequestContext, request } from "@playwright/test";

const API_BASE = process.env.E2E_API_URL ?? "http://localhost:3001";

let authContext: APIRequestContext | null = null;

export async function getApiContext(): Promise<APIRequestContext> {
  if (!authContext) {
    authContext = await request.newContext({ baseURL: API_BASE });
  }
  return authContext;
}

export async function disposeApiContext(): Promise<void> {
  await authContext?.dispose();
  authContext = null;
}

/** Staff login via real /v1/staff/auth/login endpoint. */
export async function staffLogin(
  email: string,
  password: string,
): Promise<string> {
  const ctx = await getApiContext();
  const res = await ctx.post("/v1/staff/auth/login", {
    data: { email, password },
  });
  if (res.status() !== 200) {
    throw new Error(`Staff login failed: ${String(res.status())}`);
  }
  const body = (await res.json()) as { accessToken: string };
  return body.accessToken;
}

/**
 * Guest retrieval request via the REAL guest access boundary.
 * Requires a valid Guest bearer for the session.
 */
export async function guestRequestRetrieval(
  guestToken: string,
  valetSessionId: string,
): Promise<void> {
  const ctx = await getApiContext();
  const res = await ctx.post("/v1/guest/session/retrieval-request", {
    headers: { Authorization: `Bearer ${guestToken}` },
    data: {},
  });
  if (res.status() !== 200 && res.status() !== 201) {
    throw new Error(
      `Guest retrieval request failed: ${String(res.status())}`,
    );
  }
}

/**
 * Issue a pickup code through the REAL Guest handoff verification API.
 * Returns the raw pickup code for Employee UI entry.
 */
export async function guestIssuePickupCode(
  guestToken: string,
): Promise<string> {
  const ctx = await getApiContext();
  const res = await ctx.post("/v1/guest/session/handoff-verification/issue", {
    headers: { Authorization: `Bearer ${guestToken}` },
    data: { method: "PICKUP_CODE" },
  });
  if (res.status() !== 200) {
    throw new Error(
      `Guest pickup code issue failed: ${String(res.status())}`,
    );
  }
  const body = (await res.json()) as { pickupCode: string };
  return body.pickupCode;
}

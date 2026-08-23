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
    headers: { Origin: process.env.E2E_BASE_URL ?? "http://localhost:3000" },
  });
  if (res.status() !== 200) {
    throw new Error(`Staff login failed: ${String(res.status())}`);
  }
  const body = (await res.json()) as { accessToken: string };
  return body.accessToken;
}

export async function findSessionIdByPlate(
  staffToken: string,
  locationId: string,
  plate: string,
): Promise<string> {
  const ctx = await getApiContext();
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const res = await ctx.get("/v1/staff/tasks/queue", {
      headers: { Authorization: `Bearer ${staffToken}` },
      params: { locationId },
    });
    if (res.status() !== 200) {
      throw new Error(`Task queue read failed: ${String(res.status())}`);
    }
    const body = (await res.json()) as {
      tasks: Array<{
        sessionId: string;
        vehicle: { plateNumberRaw: string | null };
      }>;
    };
    const match = body.tasks.find(
      (task) => task.vehicle.plateNumberRaw === plate,
    );
    if (match) return match.sessionId;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Created session was not found in the authoritative queue.");
}

/** Exact accepted Guest Access issue intent; raw token remains in memory. */
export async function issueGuestAccess(
  staffToken: string,
  sessionId: string,
): Promise<string> {
  const ctx = await getApiContext();
  const res = await ctx.post(
    `/v1/staff/check-in/sessions/${sessionId}/guest-access/issue`,
    {
      data: { intent: "ISSUE_OR_ROTATE" },
      headers: { Authorization: `Bearer ${staffToken}` },
    },
  );
  if (res.status() !== 200) {
    throw new Error(`Guest access issue failed: ${String(res.status())}`);
  }
  const body = (await res.json()) as { rawToken: string };
  return body.rawToken;
}

/**
 * Guest retrieval request via the REAL guest access boundary.
 * Requires a valid Guest bearer for the session.
 */
export async function guestRequestRetrieval(
  guestToken: string,
): Promise<void> {
  const ctx = await getApiContext();
  const res = await ctx.post("/v1/guest/session/request-retrieval", {
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

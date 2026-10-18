import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { expect, type Page } from "@playwright/test";

const approvedOrigin = "http://127.0.0.1:3114";
const root = resolve(__dirname, "../../..");
const refreshName = "__Secure-vaylet_staff_refresh";
type MfaState = {
  cookies: Array<{
    name: string;
    value: string;
    domain: string;
    path: string;
    httpOnly: boolean;
    secure: boolean;
    sameSite: "Strict" | "Lax" | "None";
    expires: number;
  }>;
  origins: Array<{
    origin: string;
    localStorage: Array<{ name: string; value: string }>;
  }>;
};

export function requireOwnedBrowserTarget(baseURL: string, path: string): void {
  if (baseURL !== approvedOrigin)
    throw new Error("GAP: local R2 Dashboard URL only");
  const target = new URL(path, baseURL);
  if (
    target.origin !== baseURL ||
    target.pathname !== "/audit-log" ||
    target.hash !== "" ||
    ![...target.searchParams.keys()].every((key) => key === "investigationDemo")
  ) {
    throw new Error("GAP: unapproved investigation browser route");
  }
}

/** Read exactly once: the identical in-memory object goes to Playwright after
 * the guard claims its credential. No mutable file re-read/TOCTOU. */
export function readOneTimeMfaState(stateFile: string): MfaState {
  const value = JSON.parse(
    readFileSync(resolve(stateFile), "utf8"),
  ) as MfaState;
  if (!value || !Array.isArray(value.cookies) || !Array.isArray(value.origins))
    throw new Error("GAP: invalid browser MFA state");
  requireRefreshCredential(value);
  return value;
}

function requireRefreshCredential(state: MfaState): string {
  const found = state.cookies.filter((item) => item.name === refreshName);
  if (found.length !== 1)
    throw new Error("GAP: one actual Staff refresh cookie required");
  const cookie = found[0]!;
  if (
    cookie.domain !== "127.0.0.1" ||
    cookie.path !== "/v1/staff/auth" ||
    cookie.httpOnly !== true ||
    cookie.secure !== true ||
    cookie.sameSite !== "Strict" ||
    typeof cookie.value !== "string" ||
    cookie.value.length < 16
  )
    throw new Error("GAP: task-owned Staff refresh cookie attributes mismatch");
  return cookie.value;
}

/** Same normalized HttpOnly refresh credential can NEVER initialize two test
 * contexts, even if the storage JSON, localStorage or other cookies change.
 * A retry, repeat, later invocation or shard fails before a browser context.
 */
export function consumeOneTimeMfaState(state: MfaState): void {
  const digest = createHash("sha256")
    .update("issue300:staff-refresh:127.0.0.1:/v1/staff/auth\0")
    .update(requireRefreshCredential(state))
    .digest("hex");
  const dir = join(root, "tmp", "issue300-r2-owned", "browser-spent-state");
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  writeFileSync(join(dir, digest + ".used"), "single-use MFA browser state", {
    flag: "wx",
    mode: 0o600,
  });
}

export async function requireSignedContinuation(
  page: Page,
  endpoint: "sessions" | "timeline",
  click: () => Promise<void>,
  prior: { snapshotAt: string; nextCursor: string | null; items: unknown[] },
): Promise<{
  snapshotAt: string;
  nextCursor: string | null;
  items: unknown[];
}> {
  expect(typeof prior.nextCursor).toBe("string");
  const [response] = await Promise.all([
    page.waitForResponse((reply) => {
      const url = new URL(reply.url());
      return (
        url.pathname.includes("/audit-investigations/") &&
        url.pathname.endsWith("/" + endpoint) &&
        url.searchParams.get("cursor") === prior.nextCursor
      );
    }),
    click(),
  ]);
  expect(response.status(), "Continuation must be authenticated HTTP 200").toBe(
    200,
  );
  expect(response.headers()["cache-control"]).toContain("no-store");
  const body = (await response.json()) as {
    snapshotAt: string;
    nextCursor: string | null;
    items: unknown[];
  };
  expect(body.snapshotAt).toBe(prior.snapshotAt);
  expect(Array.isArray(body.items)).toBe(true);
  expect(body.items.length).toBeGreaterThan(0);
  const identity = (item: unknown) =>
    endpoint === "sessions"
      ? (item as { sessionId: string }).sessionId
      : (() => {
          const key = (item as { key: { source: string; eventId: string } })
            .key;
          return key.source + ":" + key.eventId;
        })();
  const keys = [...prior.items, ...body.items].map(identity);
  expect(
    new Set(keys).size,
    "S0 continuation must not replay previous source IDs",
  ).toBe(keys.length);
  if (body.nextCursor !== null)
    expect(body.nextCursor).not.toBe(prior.nextCursor);
  return body;
}

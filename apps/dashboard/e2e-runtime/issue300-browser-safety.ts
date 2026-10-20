import { createHash, createPublicKey, verify } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { expect, type Page, type Response } from "@playwright/test";

const root = resolve(__dirname, "../../..");
const refreshName = "__Secure-vaylet_staff_refresh";
const forbiddenPorts = new Set([3001, 3003, 3114, 3164, 3165, 58387]);
const hexSha = /^[a-f0-9]{64}$/;
const gitSha = /^[a-f0-9]{40}$/;
// Owner-issued Ed25519 SPKI public key, pinned in reviewed SOURCE (public only).
// Never permit an env/file-provided key to approve its own origin or lease.
const OWNER_PUBLIC_KEY_SPKI_DER_BASE64 =
  "MCowBQYDK2VwAyEApth1azlOHaJPPtirnSl5TB3UcAV/GOuWQeUFRx7wy/c=";

/** This is a pin-verified owner supplied allowlist, NOT a self-service port override. */
export type OwnedBrowserTarget = {
  kind: "ISSUE300_W7_ISOLATED_BROWSER_TARGET_V1";
  candidateSha: string;
  leaseId: string;
  dashboardOrigin: string;
  apiOrigin: string;
  allowedOrigins: string[];
  expiresAt: string;
};

type TargetInputs = {
  baseURL: string;
  candidateSha: string;
  leaseId: string;
  testOnly: string | undefined;
  pinnedDigest: string;
  attestationBytes: Buffer;
  checkoutSha: string;
  ownerPublicKey: string;
  ownerSignature: Buffer;
  now?: number;
};

function isolatedOrigin(raw: string): void {
  if (typeof raw !== "string") throw new Error("GAP: missing isolated origin");
  const url = new URL(raw);
  const port = Number(url.port);
  if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" ||
      url.origin !== raw || !Number.isInteger(port) || port < 1024 ||
      port > 65535 || forbiddenPorts.has(port))
    throw new Error("GAP: origin is not a dedicated isolated loopback target");
}

/** Owner signature is authority; the digest is only an integrity/TOCTOU check. */
export function validateOwnedBrowserAttestation(input: TargetInputs): OwnedBrowserTarget {
  if (input.testOnly !== "1" || !gitSha.test(input.candidateSha) ||
      input.checkoutSha !== input.candidateSha || !input.leaseId ||
      !hexSha.test(input.pinnedDigest) ||
      createHash("sha256").update(input.attestationBytes).digest("hex") !== input.pinnedDigest)
    throw new Error("GAP: test-only owner attestation, immutable SHA or digest absent");
  try {
    const key = createPublicKey({
      key: Buffer.from(input.ownerPublicKey, "base64"), format: "der", type: "spki",
    });
    if (key.asymmetricKeyType !== "ed25519" || input.ownerSignature.length !== 64 ||
        !verify(null, input.attestationBytes, key, input.ownerSignature))
      throw new Error("Invalid owner signature");
  } catch {
    throw new Error("GAP: Owner Ed25519 signature untrusted or absent");
  }
  const grant = JSON.parse(input.attestationBytes.toString("utf8")) as OwnedBrowserTarget;
  if (grant?.kind !== "ISSUE300_W7_ISOLATED_BROWSER_TARGET_V1" ||
      grant.candidateSha !== input.candidateSha || grant.leaseId !== input.leaseId ||
      !Array.isArray(grant.allowedOrigins) || grant.allowedOrigins.length !== 1 ||
      grant.allowedOrigins[0] !== input.baseURL ||
      grant.dashboardOrigin !== input.baseURL ||
      typeof grant.apiOrigin !== "string" || grant.apiOrigin === input.baseURL)
    throw new Error("GAP: unapproved isolated browser allowlist/SHA/lease");
  isolatedOrigin(grant.dashboardOrigin);
  isolatedOrigin(grant.apiOrigin);
  const expires = Date.parse(grant.expiresAt);
  const now = input.now ?? Date.now();
  if (!Number.isFinite(expires) || expires <= now || expires > now + 15 * 60_000)
    throw new Error("GAP: expired or excessively long browser lease");
  return grant;
}

export function readOwnedBrowserAttestation(input: {
  baseURL: string; candidateSha: string; leaseId: string;
  testOnly: string | undefined; pinnedDigest: string; attestationFile: string;
}): OwnedBrowserTarget {
  if (!OWNER_PUBLIC_KEY_SPKI_DER_BASE64)
    throw new Error("GAP: Owner signing public key not yet pinned in reviewed source");
  const path = resolve(input.attestationFile);
  const bytes = readFileSync(path);
  const ownerSignature = readFileSync(path + ".sig");
  const checkoutSha = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root, encoding: "utf8", windowsHide: true,
  }).trim();
  return validateOwnedBrowserAttestation({ ...input, attestationBytes: bytes,
    ownerPublicKey: OWNER_PUBLIC_KEY_SPKI_DER_BASE64, ownerSignature, checkoutSha });
}
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

export function requireOwnedBrowserTarget(baseURL: string, path: string,
  grant: OwnedBrowserTarget): void {
  if (baseURL !== grant.dashboardOrigin || grant.allowedOrigins[0] !== baseURL)
    throw new Error("GAP: browser target differs from owner allowlist");
  const target = new URL(path, baseURL);
  if (
    target.origin !== baseURL ||
    target.pathname !== "/audit-log" ||
    target.hash !== "" ||
    ![...target.searchParams.keys()].every((key) => key === "investigationDemo") ||
    target.searchParams.getAll("investigationDemo").some((value) => value !== "1")
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

/** Capture the FIRST authenticated Timeline request even when Search auto-selects
 * its first result before a later explicit click. Never accept cursor pages. */
export function firstTimelineCollector(origin: string, sessionUuid: string) {
  const replies: Response[] = [];
  return {
    capture(reply: Response): void {
      const url = new URL(reply.url());
      if (url.origin === origin &&
          url.pathname.includes("/audit-investigations/sessions/") &&
          url.pathname.endsWith(`/${sessionUuid}/timeline`) &&
          !url.searchParams.has("cursor")) replies.push(reply);
    },
    get first(): Response | null { return replies[0] ?? null; },
  };
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

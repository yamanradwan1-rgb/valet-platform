import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import {
  bindInvestigationCursor,
  decodeInvestigationCursor,
  encodeInvestigationCursor,
} from "../../src/modules/management/audit-investigation/audit-investigation-cursor";
import type { StaffSessionContext } from "../../src/modules/auth/staff-session-context";

const org = "aaaaaaaa-aaaa-4aaa-8aaa-000000000001";
const loc = "aaaaaaaa-aaaa-4aaa-8aaa-000000000002";
const membership = "aaaaaaaa-aaaa-4aaa-8aaa-000000000003";
const userId = "aaaaaaaa-aaaa-4aaa-8aaa-000000000004";
const sessionId = "aaaaaaaa-aaaa-4aaa-8aaa-000000000005";
const recordId = "aaaaaaaa-aaaa-4aaa-8aaa-000000000006";
const originalSecret = process.env.ANTI_ABUSE_HMAC_SECRET_B64URL;
const at = "2026-10-18T01:00:00.000Z";

beforeAll(() => {
  process.env.ANTI_ABUSE_HMAC_SECRET_B64URL =
    randomBytes(32).toString("base64url");
});
afterAll(() => {
  if (originalSecret === undefined)
    delete process.env.ANTI_ABUSE_HMAC_SECRET_B64URL;
  else process.env.ANTI_ABUSE_HMAC_SECRET_B64URL = originalSecret;
});
function binding(
  params: {
    purpose?: "SEARCH_SESSIONS" | "SESSION_TIMELINE";
    viewer?: string;
    location?: string;
    window?: string;
    session?: string;
  } = {},
) {
  return bindInvestigationCursor({
    purpose: params.purpose ?? "SEARCH_SESSIONS",
    scope: {
      organizationId: org,
      locationId: params.location ?? loc,
      membershipId: membership,
      role: "ORG_ADMIN",
    },
    context: {
      userId,
      staffAuthSessionId: params.viewer ?? sessionId,
    } as StaffSessionContext,
    normalizedFilters: {
      from: params.window ?? at,
      to: "2026-10-18T02:00:00.000Z",
    },
    ...(params.purpose === "SESSION_TIMELINE"
      ? { sessionId: params.session ?? recordId }
      : {}),
  });
}
describe("Issue300 U05 signed stateless page cursor — pure no database", () => {
  it("roundtrips bounded keyset/snapshot only under precise purpose/viewer/Location/window", () => {
    const bound = binding();
    const payload = {
      version: 1 as const,
      purpose: "SEARCH_SESSIONS" as const,
      organizationId: bound.organizationId,
      locationId: bound.locationId,
      viewerSessionDigest: bound.viewerSessionDigest,
      filterDigest: bound.filterDigest,
      snapshotAt: at,
      snapshotCutoff: "2026-10-18T01:00:00.000000Z",
      databaseSnapshot: "10:20:",
      issuedAt: at,
      expiresAt: "2026-10-18T01:15:00.000Z",
      last: {
        lastMatchedAt: "2026-10-18T01:00:00.000500Z",
        sessionId: recordId,
      },
    };
    const encoded = encodeInvestigationCursor(bound, payload, new Date(at));
    expect(decodeInvestigationCursor(encoded, bound, new Date(at))).toEqual(
      payload,
    );
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    for (const altered of [
      binding({ viewer: recordId }),
      binding({ location: recordId }),
      binding({ window: "2026-10-18T00:00:00.000Z" }),
      binding({ purpose: "SESSION_TIMELINE" }),
    ]) {
      expect(() =>
        decodeInvestigationCursor(encoded, altered, new Date(at)),
      ).toThrow();
    }
    expect(() =>
      decodeInvestigationCursor(
        encoded,
        bound,
        new Date("2026-10-18T01:15:00.000Z"),
      ),
    ).toThrow();
    const broken = encoded.slice(0, -1) + (encoded.endsWith("A") ? "B" : "A");
    expect(() =>
      decodeInvestigationCursor(broken, bound, new Date(at)),
    ).toThrow();
  });

  it("fails closed for snapshots exceeding the 512-character persistence contract", () => {
    const bound = binding();
    expect(() =>
      encodeInvestigationCursor(
        bound,
        {
          version: 1,
          purpose: "SEARCH_SESSIONS",
          organizationId: org,
          locationId: loc,
          viewerSessionDigest: bound.viewerSessionDigest,
          filterDigest: bound.filterDigest,
          snapshotAt: at,
          snapshotCutoff: "2026-10-18T01:00:00.000000Z",
          databaseSnapshot: "10:999:" + "12,".repeat(300),
          issuedAt: at,
          expiresAt: "2026-10-18T01:15:00.000Z",
          last: {
            lastMatchedAt: "2026-10-18T01:00:00.000500Z",
            sessionId: recordId,
          },
        },
        new Date(at),
      ),
    ).toThrow();
  });
});

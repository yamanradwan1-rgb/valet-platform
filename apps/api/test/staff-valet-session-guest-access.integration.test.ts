import { randomBytes, randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { StaffValetSessionDetailResponse } from "@valet/contracts";

import {
  createStaffValetSessionHarness,
  type StaffValetSessionHarness,
} from "./staff-valet-session-harness";

function placeholderHash(): string {
  return `disabled:intake:${randomBytes(32).toString("hex")}`;
}

async function applyCredential(
  harness: StaffValetSessionHarness,
  sessionId: string,
  columns: {
    expiresAtSql?: string;
    revokedAtSql?: string;
    tokenHash?: string;
  },
): Promise<void> {
  await harness.context.adminPool.query(
    `UPDATE valet_sessions
     SET customer_access_token_hash = $2,
         customer_access_expires_at =
           COALESCE(${columns.expiresAtSql ?? "customer_access_expires_at"},
                    customer_access_expires_at),
         customer_access_revoked_at =
           COALESCE(${columns.revokedAtSql ?? "NULL"},
                    customer_access_revoked_at)
     WHERE id = $1`,
    [sessionId, columns.tokenHash ?? `hash:${sessionId}`],
  );
}

describe("Staff Session Detail Guest Access Projection", () => {
  let harness: StaffValetSessionHarness;

  beforeAll(async () => {
    harness = createStaffValetSessionHarness();
    await harness.start();
  }, 120_000);

  afterAll(async () => {
    await harness.close();
  }, 60_000);

  async function readGuestAccess(sessionId: string, token: string) {
    const res = await harness.request<StaffValetSessionDetailResponse>(
      "GET",
      `/v1/staff/valet-sessions/${sessionId}`,
      { token },
    );
    expect(res.status).toBe(200);
    return res.body.guestAccess;
  }

  it("reports NOT_ISSUED with null timestamps for the disabled intake placeholder even when revocation metadata is populated", async () => {
    const { fixture, token } = await harness.fixtureWithToken();
    const { sessionId } = await harness.createSession(fixture);
    await applyCredential(harness, sessionId, {
      expiresAtSql: "transaction_timestamp()",
      revokedAtSql: "transaction_timestamp()",
      tokenHash: placeholderHash(),
    });

    const guestAccess = await readGuestAccess(sessionId, token);
    expect(guestAccess.status).toBe("NOT_ISSUED");
    expect(guestAccess.expiresAt).toBeNull();
    expect(guestAccess.revokedAt).toBeNull();
  });

  it("reports ACTIVE with actual expiry while it is still future against database time", async () => {
    const { fixture, token } = await harness.fixtureWithToken();
    const { sessionId } = await harness.createSession(fixture);
    await applyCredential(harness, sessionId, {
      expiresAtSql: "clock_timestamp() + interval '1 hour'",
    });

    const guestAccess = await readGuestAccess(sessionId, token);
    expect(guestAccess.status).toBe("ACTIVE");
    expect(guestAccess.revokedAt).toBeNull();
    expect(guestAccess.expiresAt).toEqual(
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/),
    );
  });

  it("reports EXPIRED once expiry has passed against database time", async () => {
    const { fixture, token } = await harness.fixtureWithToken();
    const { sessionId } = await harness.createSession(fixture);
    await applyCredential(harness, sessionId, {
      expiresAtSql: "clock_timestamp() - interval '1 second'",
    });

    const guestAccess = await readGuestAccess(sessionId, token);
    expect(guestAccess.status).toBe("EXPIRED");
    expect(guestAccess.revokedAt).toBeNull();
    expect(guestAccess.expiresAt).not.toBeNull();
  });

  it("reports REVOKED with the exact authoritative revoked timestamp", async () => {
    const { fixture, token } = await harness.fixtureWithToken();
    const { sessionId } = await harness.createSession(fixture);
    await applyCredential(harness, sessionId, {
      revokedAtSql: "'2026-08-21T19:30:00.456Z'::timestamptz",
    });

    const guestAccess = await readGuestAccess(sessionId, token);
    expect(guestAccess.status).toBe("REVOKED");
    expect(guestAccess.revokedAt).toBe("2026-08-21T19:30:00.456Z");
    expect(guestAccess.expiresAt).not.toBeNull();
  });

  it("never exposes token hashes or credential material in the detail payload", async () => {
    const { fixture, token } = await harness.fixtureWithToken();
    const { sessionId } = await harness.createSession(fixture);
    await applyCredential(harness, sessionId, {
      revokedAtSql: "transaction_timestamp()",
    });

    const res = await harness.request<StaffValetSessionDetailResponse>(
      "GET",
      `/v1/staff/valet-sessions/${sessionId}`,
      { token },
    );
    expect(res.status).toBe(200);
    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toContain("sha256:");
    expect(serialized).not.toContain("disabled:intake:");
    expect(serialized).not.toContain("rawToken");
    expect(serialized).not.toContain("tokenHash");
    expect(serialized).not.toContain(token);
    expect(Object.keys(res.body)).not.toContain("guestAccessTokenHash");
  });

  it("still rejects an unauthorized reader before any projection is assembled", async () => {
    const { fixture } = await harness.fixtureWithToken();
    const outsider = await harness.context.createFixture();
    const outsiderToken = `token-${randomUUID()}`;
    harness.principals.set(`Bearer ${outsiderToken}`, outsider.userId);
    const { sessionId } = await harness.createSession(fixture);

    const res = await harness.request(
      "GET",
      `/v1/staff/valet-sessions/${sessionId}`,
      { token: outsiderToken },
    );
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("TENANT_ACCESS_DENIED");
  });
});

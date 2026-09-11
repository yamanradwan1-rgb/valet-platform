import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { StaffPushApiFixture } from "./staff-push-api-fixture";

const fixture = new StaffPushApiFixture();

beforeAll(() => fixture.start(), 120_000);
afterAll(() => fixture.stop(), 60_000);

describe("Staff push registration transport and authority", () => {
  it("creates one safe ACTIVE registration for the exact bearer session", async () => {
    const auth = await fixture.login();
    const body = fixture.requestBody();
    const result = await fixture.put(auth, body);

    expect(result.status).toBe(200);
    expect(result.body).toEqual({
      appBuild: body.appBuild,
      appIdentifier: body.appIdentifier,
      appVersion: body.appVersion,
      installationId: body.installationId,
      lastConfirmedAt: expect.any(String),
      locale: body.locale,
      platform: body.platform,
      provider: body.provider,
      registrationId: expect.any(String),
      state: "ACTIVE",
    });
    expect(JSON.stringify(result.body)).not.toContain(body.providerToken);
    expect(result.body).not.toHaveProperty("tokenHash");
    expect(result.body).not.toHaveProperty("staffAuthSessionId");
    expect(result.headers.get("cache-control")).toBe("no-store");

    const rows = await fixture.registrations();
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0]).toMatchObject({
      id: result.body?.registrationId,
      installation_id: body.installationId,
      provider_token: body.providerToken,
      staff_auth_session_id: auth.sessionId,
      state: "ACTIVE",
    });
    expect(rows.rows[0]!.token_hash).toMatch(
      /^staff-push-token-sha256:v1:[0-9a-f]{64}$/,
    );
  });

  it("rejects missing and malformed bearer credentials without writes", async () => {
    const body = fixture.requestBody();
    const missing = await fixture.request("/v1/staff/push/registrations", {
      body,
      method: "PUT",
    });
    const malformed = await fixture.request("/v1/staff/push/registrations", {
      authorization: "Bearer malformed",
      body,
      method: "PUT",
    });
    expect(missing.status).toBe(401);
    expect(malformed.status).toBe(401);
    expect((await fixture.registrations()).rows).toHaveLength(1);
  });

  it.each([
    ["revoked session", "revoked"],
    ["expired access", "access"],
    ["absolute-expired session", "absolute"],
    ["disabled User", "user"],
  ])("rejects a %s after initial bearer resolution", async (_name, mode) => {
    const auth = await fixture.login();
    if (mode === "revoked") {
      await fixture.query(
        `UPDATE staff_auth_sessions SET revoked_at = transaction_timestamp()
         WHERE id = $1`,
        [auth.sessionId],
      );
    } else if (mode === "access") {
      await fixture.query(
        `UPDATE staff_auth_sessions
         SET access_expires_at = created_at + interval '1 millisecond'
         WHERE id = $1`,
        [auth.sessionId],
      );
      await new Promise((resolve) => setTimeout(resolve, 5));
    } else if (mode === "absolute") {
      await fixture.query(
        `UPDATE staff_auth_sessions
         SET created_at = clock.t,
             last_rotated_at = clock.t,
             access_expires_at = clock.t + interval '1 minute',
             absolute_expires_at = clock.t + interval '720 hours'
         FROM (SELECT transaction_timestamp() - interval '31 days' AS t) clock
         WHERE id = $1`,
        [auth.sessionId],
      );
    } else {
      await fixture.query(
        `UPDATE users SET status = 'DISABLED' WHERE id = $1`,
        [auth.userId],
      );
    }
    const before = (await fixture.registrations()).rowCount;
    const result = await fixture.put(auth, fixture.requestBody());
    expect(result.status).toBe(401);
    expect((await fixture.registrations()).rowCount).toBe(before);
  });

  it.each([
    { provider: "APNS" },
    { platform: "IOS" },
    { appIdentifier: "com.example.employee" },
    { installationId: "not-a-uuid" },
    { providerToken: "" },
    { providerToken: "x".repeat(4097) },
    { appVersion: "x".repeat(65) },
    { appBuild: "x".repeat(65) },
    { locale: "fr" },
    { sessionId: "00000000-0000-4000-8000-000000000001" },
    { userId: "00000000-0000-4000-8000-000000000001" },
    { organizationId: "00000000-0000-4000-8000-000000000001" },
    { registrationId: "00000000-0000-4000-8000-000000000001" },
    { tokenHash: "restricted" },
    { state: "ACTIVE" },
  ])(
    "rejects invalid, unsupported, unknown, or authority input %#",
    async (change) => {
      const auth = await fixture.login();
      const result = await fixture.put(auth, {
        ...fixture.requestBody(),
        ...change,
      });
      expect(result.status).toBe(400);
    },
  );

  it("rejects non-empty query and non-JSON content before writing", async () => {
    const auth = await fixture.login();
    const query = await fixture.put(auth, fixture.requestBody(), "?role=admin");
    const nonJson = await fixture.request("/v1/staff/push/registrations", {
      authorization: `Bearer ${auth.accessToken}`,
      body: fixture.requestBody(),
      contentType: "text/plain",
      method: "PUT",
    });
    expect(query.status).toBe(400);
    expect(nonJson.status).toBe(400);
  });

  it("requires a UUID route ID, strict empty disable JSON, and empty query", async () => {
    const auth = await fixture.login();
    const invalidId = await fixture.disable(auth, "not-a-uuid");
    const bodyAuthority = await fixture.disable(
      auth,
      "00000000-0000-4000-8000-000000000001",
      { sessionId: auth.sessionId },
    );
    const queryAuthority = await fixture.disable(
      auth,
      "00000000-0000-4000-8000-000000000001",
      {},
      "?userId=spoofed",
    );
    expect(invalidId.status).toBe(400);
    expect(bodyAuthority.status).toBe(400);
    expect(queryAuthority.status).toBe(400);
  });
});

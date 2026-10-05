import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  staffAuthAccessResponseSchema,
  staffNativeAuthResponseSchema,
  staffAuthSessionContinuitySchema,
  STAFF_AUTH_SESSION_CONTINUITY_HEADER,
} from "@valet/contracts";
import { StaffAuthNativeFixture } from "./staff-auth-native-fixture";

const legacyKeys = {
  accessToken: true,
  tokenType: true,
  accessExpiresAt: true,
  sessionExpiresAt: true,
} as const;
const oldStrictWeb = staffAuthAccessResponseSchema.pick(legacyKeys).strict();
const oldStrictNative = staffNativeAuthResponseSchema
  .pick({ ...legacyKeys, refreshToken: true })
  .strict();
const headerId = (response: { headers: Headers }) =>
  staffAuthSessionContinuitySchema.parse(
    response.headers.get(STAFF_AUTH_SESSION_CONTINUITY_HEADER),
  );

const fixture = new StaffAuthNativeFixture();
beforeAll(() => fixture.start(), 120_000);
beforeEach(() => fixture.resetLimits());
afterAll(() => fixture.stop(), 60_000);

describe("persisted Staff auth session continuity", () => {
  it("login and ordinary cookie refresh return the exact persisted session UUID", async () => {
    const user = await fixture.createUser();
    const login = await fixture.request("/v1/staff/auth/login", {
      origin: fixture.allowedOrigin,
      body: { email: user.email, password: user.password },
    });
    expect(login.status).toBe(200);
    const first = staffAuthAccessResponseSchema.parse(login.body);
    const firstId = headerId(login);
    expect(Object.keys(login.body!).sort()).toEqual(
      Object.keys(legacyKeys).sort(),
    );
    expect(oldStrictWeb.safeParse(login.body).success).toBe(true);
    expect(login.body).not.toHaveProperty("staffAuthSessionId");
    const refreshed = await fixture.request("/v1/staff/auth/refresh", {
      origin: fixture.allowedOrigin,
      cookie: login.headers.get("set-cookie")!.split(";", 1)[0] ?? "",
    });
    expect(refreshed.status).toBe(200);
    const second = staffAuthAccessResponseSchema.parse(refreshed.body);
    expect(headerId(refreshed)).toBe(firstId);
    expect(oldStrictWeb.safeParse(refreshed.body).success).toBe(true);
    expect(Object.keys(refreshed.body!).sort()).toEqual(
      Object.keys(legacyKeys).sort(),
    );
    expect(second.accessToken).not.toBe(first.accessToken);
    expect(second.sessionExpiresAt).toBe(first.sessionExpiresAt);
    const persisted = await fixture.query<{ id: string; user_id: string }>(
      "SELECT id, user_id FROM staff_auth_sessions WHERE user_id = $1",
      [user.id],
    );
    expect(persisted.rows).toEqual([{ id: firstId, user_id: user.id }]);
  });

  it("same-User independent logins differ, and cookie B refresh truthfully identifies B even at equal expiry", async () => {
    const user = await fixture.createUser();
    const login = () =>
      fixture.request("/v1/staff/auth/login", {
        origin: fixture.allowedOrigin,
        body: { email: user.email, password: user.password },
      });
    const a = await login();
    const b = await login();
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    const first = staffAuthAccessResponseSchema.parse(a.body);
    const second = staffAuthAccessResponseSchema.parse(b.body);
    expect(headerId(b)).not.toBe(headerId(a));
    // Deliberately equal persisted deadlines: expiry cannot be continuity identity.
    await fixture.query(
      "UPDATE staff_auth_sessions SET absolute_expires_at = $1 WHERE user_id = $2",
      [first.sessionExpiresAt, user.id],
    );
    const result = await fixture.request("/v1/staff/auth/refresh", {
      origin: fixture.allowedOrigin,
      cookie: b.headers.get("set-cookie")!.split(";", 1)[0] ?? "",
    });
    expect(result.status).toBe(200);
    const rotated = staffAuthAccessResponseSchema.parse(result.body);
    expect(headerId(result)).toBe(headerId(b));
    expect(headerId(result)).not.toBe(headerId(a));
    expect(rotated.sessionExpiresAt).toBe(first.sessionExpiresAt);
    expect(rotated.accessToken).not.toBe(second.accessToken);
    const sessions = await fixture.query(
      "SELECT id FROM staff_auth_sessions WHERE user_id = $1",
      [user.id],
    );
    expect(sessions.rows).toHaveLength(2);
  });

  it("old strict Native clients parse unchanged login and refresh bodies", async () => {
    const user = await fixture.createUser();
    const login = await fixture.request("/v1/staff/auth/native/login", {
      body: { email: user.email, password: user.password },
    });
    expect(login.status).toBe(200);
    const first = staffNativeAuthResponseSchema.parse(login.body);
    const refresh = await fixture.request("/v1/staff/auth/native/refresh", {
      body: { refreshToken: first.refreshToken },
    });
    expect(refresh.status).toBe(200);
    const second = staffNativeAuthResponseSchema.parse(refresh.body);
    for (const response of [login, refresh]) {
      expect(Object.keys(response.body!).sort()).toEqual(
        [...Object.keys(legacyKeys), "refreshToken"].sort(),
      );
      expect(response.body).not.toHaveProperty("staffAuthSessionId");
      expect(oldStrictNative.safeParse(response.body).success).toBe(true);
    }
    expect(second.accessToken).not.toBe(first.accessToken);
    expect(second.refreshToken).not.toBe(first.refreshToken);
  });
});

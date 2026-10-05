import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  staffAuthAccessResponseSchema,
  staffNativeAuthResponseSchema,
} from "@valet/contracts";
import { StaffAuthNativeFixture } from "./staff-auth-native-fixture";

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
    const refreshed = await fixture.request("/v1/staff/auth/refresh", {
      origin: fixture.allowedOrigin,
      cookie: login.headers.get("set-cookie")!.split(";", 1)[0] ?? "",
    });
    expect(refreshed.status).toBe(200);
    const second = staffAuthAccessResponseSchema.parse(refreshed.body);
    expect(second.staffAuthSessionId).toBe(first.staffAuthSessionId);
    expect(second.accessToken).not.toBe(first.accessToken);
    expect(second.sessionExpiresAt).toBe(first.sessionExpiresAt);
    const persisted = await fixture.query<{ id: string; user_id: string }>(
      "SELECT id, user_id FROM staff_auth_sessions WHERE user_id = $1",
      [user.id],
    );
    expect(persisted.rows).toEqual([
      { id: first.staffAuthSessionId, user_id: user.id },
    ]);
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
    expect(second.staffAuthSessionId).not.toBe(first.staffAuthSessionId);
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
    expect(rotated.staffAuthSessionId).toBe(second.staffAuthSessionId);
    expect(rotated.staffAuthSessionId).not.toBe(first.staffAuthSessionId);
    expect(rotated.sessionExpiresAt).toBe(first.sessionExpiresAt);
    expect(rotated.accessToken).not.toBe(second.accessToken);
    const sessions = await fixture.query(
      "SELECT id FROM staff_auth_sessions WHERE user_id = $1",
      [user.id],
    );
    expect(sessions.rows).toHaveLength(2);
  });

  it("Native extends the same continuity contract without changing credential rotation", async () => {
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
    expect(second.staffAuthSessionId).toBe(first.staffAuthSessionId);
    expect(second.accessToken).not.toBe(first.accessToken);
    expect(second.refreshToken).not.toBe(first.refreshToken);
  });
});

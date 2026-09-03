import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { StaffAuthNativeFixture } from "./staff-auth-native-fixture";

const fixture = new StaffAuthNativeFixture();

function refreshFrom(result: { body: Record<string, unknown> | undefined }) {
  const refreshToken = result.body?.refreshToken;
  expect(refreshToken).toMatch(/^vsr1\.[A-Za-z0-9_-]{43}$/);
  return String(refreshToken);
}

function cookieFrom(result: { headers: Headers }): string {
  return result.headers.get("set-cookie")?.split(";", 1)[0] ?? "";
}

beforeAll(() => fixture.start(), 120_000);
beforeEach(() => fixture.resetLimits());
afterAll(() => fixture.stop(), 60_000);

describe("Native Staff authentication transport", () => {
  it("logs in without Origin and returns only the accepted native shape", async () => {
    const user = await fixture.createUser();
    const result = await fixture.request("/v1/staff/auth/native/login", {
      body: { email: user.email, password: user.password },
    });

    expect(result.status).toBe(200);
    expect(Object.keys(result.body ?? {}).sort()).toEqual([
      "accessExpiresAt",
      "accessToken",
      "refreshToken",
      "sessionExpiresAt",
      "tokenType",
    ]);
    expect(result.body?.tokenType).toBe("Bearer");
    expect(result.headers.get("set-cookie")).toBeNull();
    expect(result.headers.get("cache-control")).toBe("no-store");
    expect(result.headers.get("pragma")).toBe("no-cache");
  });

  it.each([
    [
      "unknown body field",
      "",
      { email: "bad@example.com", password: "x", role: "ORG_ADMIN" },
      "application/json",
    ],
    [
      "non-empty query",
      "?deviceId=not-authority",
      { email: "bad@example.com", password: "x" },
      "application/json",
    ],
    [
      "non-JSON content",
      "",
      { email: "bad@example.com", password: "x" },
      "text/plain",
    ],
  ])(
    "rejects %s before authentication",
    async (_name, query, body, contentType) => {
      const result = await fixture.request(
        `/v1/staff/auth/native/login${query}`,
        {
          body,
          contentType,
        },
      );
      expect(result.status).toBe(400);
      expect(result.body?.code).toBe("REQUEST_INVALID");
    },
  );

  it("does not treat arbitrary Origin as native authority", async () => {
    const user = await fixture.createUser();
    const result = await fixture.request("/v1/staff/auth/native/login", {
      body: { email: user.email, password: user.password },
      origin: "https://attacker.invalid",
    });
    expect(result.status).toBe(200);
    expect(result.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("requires JSON refresh authority, rotates, and revokes replay family", async () => {
    const user = await fixture.createUser();
    const login = await fixture.request("/v1/staff/auth/native/login", {
      body: { email: user.email, password: user.password },
    });
    const refresh0 = refreshFrom(login);

    const cookieOnly = await fixture.request("/v1/staff/auth/native/refresh", {
      cookie: `__Secure-vaylet_staff_refresh=${refresh0}`,
    });
    expect(cookieOnly.status).toBe(400);

    const rotated = await fixture.request("/v1/staff/auth/native/refresh", {
      body: { refreshToken: refresh0 },
    });
    expect(rotated.status).toBe(200);
    expect(rotated.headers.get("set-cookie")).toBeNull();
    const refresh1 = refreshFrom(rotated);
    expect(refresh1).not.toBe(refresh0);

    const replay = await fixture.request("/v1/staff/auth/native/refresh", {
      body: { refreshToken: refresh0 },
    });
    expect(replay.status).toBe(401);
    const revokedFamily = await fixture.request(
      "/v1/staff/auth/native/refresh",
      { body: { refreshToken: refresh1 } },
    );
    expect(revokedFamily.status).toBe(401);
  });

  it("keeps cookie-only logout non-authoritative", async () => {
    const user = await fixture.createUser();
    const login = await fixture.request("/v1/staff/auth/native/login", {
      body: { email: user.email, password: user.password },
    });
    const refreshToken = refreshFrom(login);
    const cookieOnly = await fixture.request("/v1/staff/auth/native/logout", {
      cookie: `__Secure-vaylet_staff_refresh=${refreshToken}`,
    });
    expect(cookieOnly.status).toBe(400);

    const stillValid = await fixture.request("/v1/staff/auth/native/refresh", {
      body: { refreshToken },
    });
    expect(stillValid.status).toBe(200);
  });

  it("logs out with refresh JSON and returns an empty non-disclosing 204", async () => {
    const user = await fixture.createUser();
    const login = await fixture.request("/v1/staff/auth/native/login", {
      body: { email: user.email, password: user.password },
    });
    const refreshToken = refreshFrom(login);
    const logout = await fixture.request("/v1/staff/auth/native/logout", {
      body: { refreshToken },
    });
    expect(logout.status).toBe(204);
    expect(logout.body).toBeUndefined();
    expect(logout.headers.get("set-cookie")).toBeNull();
    const refresh = await fixture.request("/v1/staff/auth/native/refresh", {
      body: { refreshToken },
    });
    expect(refresh.status).toBe(401);
  });

  it("shares the durable identifier limiter across Native and Web login", async () => {
    const user = await fixture.createUser();
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const result = await fixture.request("/v1/staff/auth/native/login", {
        body: { email: user.email, password: "wrong" },
      });
      expect(result.status).toBe(401);
    }
    const webFailure = await fixture.request("/v1/staff/auth/login", {
      body: { email: user.email, password: "wrong" },
      origin: fixture.allowedOrigin,
    });
    expect(webFailure.status).toBe(401);
    const blockedNative = await fixture.request("/v1/staff/auth/native/login", {
      body: { email: user.email, password: user.password },
    });
    expect(blockedNative.status).toBe(429);
    expect(blockedNative.body?.code).toBe("STAFF_AUTHENTICATION_RATE_LIMITED");
  }, 30_000);

  it("preserves Web Origin, cookie, strict JSON, and response boundaries", async () => {
    const user = await fixture.createUser();
    const missingOrigin = await fixture.request("/v1/staff/auth/login", {
      body: { email: user.email, password: user.password },
    });
    expect(missingOrigin.status).toBe(403);

    const login = await fixture.request("/v1/staff/auth/login", {
      body: { email: user.email, password: user.password },
      origin: fixture.allowedOrigin,
    });
    expect(login.status).toBe(200);
    expect(login.body).not.toHaveProperty("refreshToken");
    const setCookie = login.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("Secure");
    expect(setCookie).toContain("SameSite=Strict");
    expect(setCookie).toContain("Path=/v1/staff/auth");
    expect(setCookie).not.toContain("Domain=");

    const refresh = await fixture.request("/v1/staff/auth/refresh", {
      cookie: cookieFrom(login),
      origin: fixture.allowedOrigin,
    });
    expect(refresh.status).toBe(200);
    expect(refresh.body).not.toHaveProperty("refreshToken");
  });

  it("purges server authority when a User is disabled", async () => {
    const user = await fixture.createUser();
    const login = await fixture.request("/v1/staff/auth/native/login", {
      body: { email: user.email, password: user.password },
    });
    const refreshToken = refreshFrom(login);
    await fixture.query("UPDATE users SET status = 'DISABLED' WHERE id = $1", [
      user.id,
    ]);
    const refresh = await fixture.request("/v1/staff/auth/native/refresh", {
      body: { refreshToken },
    });
    expect(refresh.status).toBe(401);
    expect(refresh.body?.code).toBe("STAFF_AUTHENTICATION_FAILED");
  });
});

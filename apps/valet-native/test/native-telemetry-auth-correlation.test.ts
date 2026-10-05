/**
 * Native AUTH telemetry X-Request-Id correlation tests (MOB-024A review
 * Finding #2).
 *
 * NativeAuthHttpTransport must correlate the bounded X-Request-Id
 * RESPONSE header on both the success and error paths, drop malformed or
 * injected values, omit it on network failures, never capture
 * credentials or request bodies, and keep the auth business result
 * unchanged when the collector throws.
 *
 * The route-template mapper matrix lives in
 * native-telemetry-operation.test.ts; transport-level operation cases
 * live in native-telemetry-surfaces.test.ts. Split files respect the
 * 300-line authored-file ceiling in docs/17.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EmployeeTelemetryEvent } from "@valet/employee-client";

vi.mock("expo-application", () => ({
  get nativeApplicationVersion() {
    return "2.1.0";
  },
  get nativeBuildVersion() {
    return "321";
  },
}));
vi.mock("react-native", () => ({
  Platform: {
    get OS() {
      return "android";
    },
  },
}));

const ownerModule = await import("../src/telemetry/native-telemetry-owner");
const authHttpModule = await import("../src/auth/native-auth-http");

const {
  BoundedTelemetryBuffer,
  NativeTelemetryOwner,
  getNativeTelemetry,
  installNativeTelemetry,
  resetNativeTelemetryRegistryForTests,
} = ownerModule;
const { NativeAuthHttpTransport } = authHttpModule;

const provenance = {
  appBuild: "101",
  appVersion: "1.4.0",
  platform: "android",
} as const;

const refreshToken = `vsr1.${"b".repeat(43)}`;
const password = "hunter2";
const loginBody = { email: "staff@example.com", password };

function authPayload(): Record<string, string> {
  return {
    accessExpiresAt: "2026-09-03T12:15:00.000Z",
    accessToken: `vsa1.${"a".repeat(43)}`,
    refreshToken,
    sessionExpiresAt: "2026-10-03T12:00:00.000Z",
    tokenType: "Bearer",
  };
}

function respond(
  body: unknown,
  init: { requestId?: string; status?: number } = {},
): Response {
  const headers = new Headers();
  if (init.requestId !== undefined) {
    headers.set("x-request-id", init.requestId);
  }
  return new Response(JSON.stringify(body), {
    headers,
    status: init.status ?? 200,
  });
}

function transport(): InstanceType<typeof NativeAuthHttpTransport> {
  vi.stubGlobal("__DEV__", true);
  installNativeTelemetry(
    new NativeTelemetryOwner(new BoundedTelemetryBuffer(), provenance),
  );
  return new NativeAuthHttpTransport("https://api.example.com");
}

function recorded(): EmployeeTelemetryEvent[] {
  return [...getNativeTelemetry().snapshot().events];
}

beforeEach(() => {
  resetNativeTelemetryRegistryForTests();
});

afterEach(() => {
  vi.restoreAllMocks();
  resetNativeTelemetryRegistryForTests();
});

describe("Auth telemetry X-Request-Id correlation", () => {
  it("correlates a login success with the bounded response header", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => respond(authPayload(), { requestId: "req-login-1" })),
    );
    await transport().login(loginBody);
    expect(recorded()).toEqual([
      {
        classification: "login",
        outcome: "success",
        requestId: "req-login-1",
        source: "auth",
      },
    ]);
  });

  it("correlates a login non-2xx with the bounded header + errorCode", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        respond(
          { code: "STAFF_AUTH_INVALID_CREDENTIALS", message: "Invalid." },
          { requestId: "req-login-2", status: 401 },
        ),
      ),
    );
    await expect(transport().login(loginBody)).rejects.toMatchObject({
      code: "STAFF_AUTH_INVALID_CREDENTIALS",
      status: 401,
    });
    expect(recorded()).toEqual([
      {
        classification: "login",
        errorCode: "STAFF_AUTH_INVALID_CREDENTIALS",
        outcome: "error",
        requestId: "req-login-2",
        source: "auth",
      },
    ]);
  });

  it("correlates a logout error with its response header too", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        respond(
          { code: "STAFF_AUTH_REFRESH_INVALID", message: "Expired." },
          { requestId: "req-logout-9", status: 401 },
        ),
      ),
    );
    await expect(transport().logout(refreshToken)).rejects.toMatchObject({
      code: "STAFF_AUTH_REFRESH_INVALID",
    });
    expect(recorded()).toEqual([
      {
        classification: "logout",
        errorCode: "STAFF_AUTH_REFRESH_INVALID",
        outcome: "error",
        requestId: "req-logout-9",
        source: "auth",
      },
    ]);
  });

  it("drops malformed, injected and oversized header values", async () => {
    const poisoned = [
      "abc def\nSET-COOKIE: 1",
      "  ",
      "x".repeat(200),
      "req; DROP TABLE",
    ];
    // One owner for the whole loop so every iteration's event lands in
    // the same ring (reinstalling would reset the observed buffer).
    vi.stubGlobal("__DEV__", true);
    installNativeTelemetry(
      new NativeTelemetryOwner(new BoundedTelemetryBuffer(), provenance),
    );
    let attempts = 0;
    for (const value of poisoned) {
      attempts += 1;
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => {
          // A hostile runtime may reject the header outright (Headers
          // validation) — that surfaces as a network error, still fail-open.
          try {
            return respond(authPayload(), { requestId: value });
          } catch {
            throw new Error("header rejected");
          }
        }),
      );
      const transport = new NativeAuthHttpTransport("https://api.example.com");
      await transport.login(loginBody).catch(() => undefined);
    }
    const events = recorded();
    expect(attempts).toBe(poisoned.length);
    expect(events).toHaveLength(poisoned.length);
    // Whatever the runtime did with the poisoned header, the recorded
    // events never contain it — not raw, not in any slot.
    for (const event of events) {
      expect("requestId" in event).toBe(false);
    }
    const dump = JSON.stringify(events);
    expect(dump).not.toContain("SET-COOKIE");
    expect(dump).not.toContain("DROP TABLE");
  });

  it("records an error with NO requestId when fetch itself rejects", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      }),
    );
    await expect(transport().login(loginBody)).rejects.toMatchObject({
      code: "NETWORK_ERROR",
      isNetworkError: true,
    });
    expect(recorded()).toEqual([
      {
        classification: "login",
        errorCode: "NETWORK_ERROR",
        outcome: "error",
        source: "auth",
      },
    ]);
  });

  it("never captures the refresh token, credentials, or request body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        respond(
          {
            code: "STAFF_AUTH_REFRESH_INVALID",
            message: `secret ${refreshToken} ${password}`,
          },
          { requestId: "req-refresh-3", status: 401 },
        ),
      ),
    );
    await expect(transport().refresh(refreshToken)).rejects.toMatchObject({
      code: "STAFF_AUTH_REFRESH_INVALID",
    });
    const dump = JSON.stringify(recorded());
    expect(dump).not.toContain(refreshToken);
    expect(dump).not.toContain(password);
    expect(dump).not.toContain("staff@example.com");
  });

  it("keeps the auth business result identical when the collector throws", async () => {
    const throwingBuffer = new BoundedTelemetryBuffer();
    throwingBuffer.record = () => {
      throw new Error("collector exploded");
    };
    installNativeTelemetry(
      new NativeTelemetryOwner(throwingBuffer, provenance),
    );
    vi.stubGlobal("__DEV__", true);
    const fetchMock = vi.fn(async () =>
      respond(authPayload(), { requestId: "req-4" }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const fragile = new NativeAuthHttpTransport("https://api.example.com");
    const result = await fragile.login(loginBody);
    // The business result is the parsed auth response, unchanged, and the
    // request shape is identical (same URL, body, credentials policy).
    expect(result).toEqual(authPayload());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const call = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit | undefined,
    ];
    expect(String(call[0])).toBe(
      "https://api.example.com/v1/staff/auth/native/login",
    );
    expect(call[1]?.credentials).toBe("omit");
  });
});

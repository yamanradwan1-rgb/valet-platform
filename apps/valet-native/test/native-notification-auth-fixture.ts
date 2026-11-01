import {
  NativeAuthSession,
  type InstallationAuthState,
  type SecureRefreshEnvelope,
} from "@valet/employee-client";
import { vi } from "vitest";

import { NativeAuthHttpTransport } from "../src/auth/native-auth-http";
import { NativePushHttpRegistrationTransport } from "../src/notifications/native-push-registration-transport";
import { createNativeEmployeeClient } from "../src/tasks/native-operational-http";

export function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

export const accessA = `vsa1.${"a".repeat(43)}`;
export const accessNew = `vsa1.${"b".repeat(43)}`;
export const refreshA = `vsr1.${"c".repeat(43)}`;
export const refreshNew = `vsr1.${"d".repeat(43)}`;
export const registration = {
  appBuild: "405",
  appIdentifier: "com.vaylet.employee" as const,
  appVersion: "1.0.0",
  installationId: "11111111-1111-4111-8111-111111111111",
  locale: "en" as const,
  platform: "ANDROID" as const,
  provider: "FCM" as const,
  providerToken: "synthetic-issue-405-push-token",
};

export function authResponse(
  accessToken = accessNew,
  refreshToken = refreshNew,
) {
  return {
    accessExpiresAt: "2026-11-01T12:15:00.000Z",
    accessToken,
    refreshToken,
    sessionExpiresAt: "2026-12-01T12:00:00.000Z",
    tokenType: "Bearer",
  };
}

export function denied() {
  return Response.json(
    { code: "STAFF_AUTHENTICATION_REQUIRED", message: "Denied" },
    { status: 401 },
  );
}

// Drain the event-loop turn after a controlled HTTP response; no time-based race.
export const drain = () =>
  new Promise<void>((resolve) => setImmediate(resolve));

export async function notificationAuthFixture() {
  vi.stubGlobal("__DEV__", false);
  let secure: SecureRefreshEnvelope | null = null;
  let installation: InstallationAuthState | null = null;
  let purges = 0;
  let failWrite = false;
  const refreshStarted = deferred<void>();
  const refreshResponse = deferred<Response>();
  const putStarted = deferred<void>();
  const putResponse = deferred<Response>();
  const calls: Array<{ path: string; method: string; access: string | null }> =
    [];
  const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
    const path = new URL(url).pathname;
    const access = new Headers(init.headers).get("Authorization");
    calls.push({ path, method: init.method!, access });
    if (path.endsWith("/login"))
      return Response.json(authResponse(accessA, refreshA));
    if (path.endsWith("/logout")) return new Response(null, { status: 204 });
    if (path.endsWith("/refresh")) {
      refreshStarted.resolve();
      return refreshResponse.promise;
    }
    if (init.method === "PUT") {
      putStarted.resolve();
      return putResponse.promise;
    }
    return access === `Bearer ${accessA}`
      ? denied()
      : Response.json({ current: true });
  });
  vi.stubGlobal("fetch", fetchMock);
  const auth = new NativeAuthSession({
    createInstallationGeneration: () => "installation-issue-405",
    identityState: {
      purge: () => {
        purges += 1;
      },
    },
    installationState: {
      read: async () => installation,
      write: async (value) => {
        installation = value;
      },
    },
    secureRefresh: {
      read: async () => secure,
      write: async (value) => {
        if (failWrite) throw new Error("synthetic secure replacement failure");
        secure = value;
      },
      delete: async () => {
        secure = null;
      },
    },
    transport: new NativeAuthHttpTransport("https://api.example.com"),
  });
  await auth.login({
    email: "fixture@example.com",
    password: "synthetic-fixture-password",
  });
  return {
    auth,
    calls,
    fetchMock,
    refreshStarted,
    refreshResponse,
    putStarted,
    putResponse,
    client: () => createNativeEmployeeClient("https://api.example.com", auth),
    push: new NativePushHttpRegistrationTransport(
      "https://api.example.com",
      auth,
    ),
    secure: () => secure,
    installation: () => installation,
    purges: () => purges,
    failSecureWrite: () => {
      failWrite = true;
    },
  };
}

import { afterEach, describe, expect, it, vi } from "vitest";

import { EmployeeApiError } from "@valet/employee-client";
import { NativeAuthHttpTransport } from "../src/auth/native-auth-http";
import {
  nativeDebugApiOrigin,
  resolveNativeApiOrigin,
} from "../src/auth/native-api-http";

const accessToken = `vsa1.${"a".repeat(43)}`;
const refreshToken = `vsr1.${"b".repeat(43)}`;

function authResponse() {
  return {
    accessExpiresAt: "2026-09-03T12:15:00.000Z",
    accessToken,
    refreshToken,
    sessionExpiresAt: "2026-10-03T12:00:00.000Z",
    tokenType: "Bearer",
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Native Staff auth HTTP transport", () => {
  it("uses dedicated strict JSON routes without cookies or forged Origin", async () => {
    vi.stubGlobal("__DEV__", false);
    const requests: Array<{
      init: RequestInit | undefined;
      url: string;
    }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
        requests.push({ init, url: String(url) });
        const route = String(url).split("/").at(-1);
        return route === "logout"
          ? new Response(undefined, { status: 204 })
          : Response.json(authResponse());
      }),
    );
    const transport = new NativeAuthHttpTransport("https://api.example.com");

    await transport.login({ email: "staff@example.com", password: "secret" });
    await transport.refresh(refreshToken);
    await transport.logout(refreshToken);

    expect(requests.map(({ url }) => url)).toEqual([
      "https://api.example.com/v1/staff/auth/native/login",
      "https://api.example.com/v1/staff/auth/native/refresh",
      "https://api.example.com/v1/staff/auth/native/logout",
    ]);
    for (const { init } of requests) {
      expect(init?.method).toBe("POST");
      expect(init?.credentials).toBe("omit");
      expect(init?.headers).toEqual({
        Accept: "application/json",
        "Content-Type": "application/json",
      });
      expect(init?.headers).not.toHaveProperty("Origin");
      expect(init?.headers).not.toHaveProperty("Cookie");
    }
    expect(requests[1]?.init?.body).toBe(JSON.stringify({ refreshToken }));
  });

  it("rejects cleartext release origins while allowing a debug-only origin", () => {
    expect(nativeDebugApiOrigin).toBe("http://10.0.2.2:3001");
    vi.stubGlobal("__DEV__", false);
    expect(() => new NativeAuthHttpTransport(nativeDebugApiOrigin)).toThrow(
      "requires HTTPS",
    );

    vi.stubGlobal("__DEV__", true);
    expect(
      () => new NativeAuthHttpTransport(nativeDebugApiOrigin),
    ).not.toThrow();
    expect(resolveNativeApiOrigin("http://192.168.1.67:3001/")).toBe(
      "http://192.168.1.67:3001",
    );
  });

  it("normalizes network and malformed responses without credential leakage", async () => {
    vi.stubGlobal("__DEV__", false);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error(refreshToken)));
    const transport = new NativeAuthHttpTransport("https://api.example.com");

    await expect(transport.refresh(refreshToken)).rejects.toMatchObject({
      code: "NETWORK_ERROR",
      isNetworkError: true,
    });
    try {
      await transport.refresh(refreshToken);
    } catch (error) {
      expect(error).toBeInstanceOf(EmployeeApiError);
      expect(String(error)).not.toContain(refreshToken);
    }
  });

  it("normalizes a lost response body as a transient network failure", async () => {
    vi.stubGlobal("__DEV__", false);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: vi.fn().mockRejectedValue(new Error(refreshToken)),
      }),
    );
    const transport = new NativeAuthHttpTransport("https://api.example.com");

    await expect(transport.refresh(refreshToken)).rejects.toMatchObject({
      code: "NETWORK_ERROR",
      isNetworkError: true,
    });
  });
});

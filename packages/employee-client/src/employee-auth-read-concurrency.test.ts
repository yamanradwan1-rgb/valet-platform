import { describe, expect, it, vi } from "vitest";
import { EmployeeClient } from "./employee-client";
import {
  authenticatedStorage,
  deferred,
  fixture,
  refresh0,
  response,
} from "./native-auth-test-fixture";

describe("safe-read auth refresh concurrency", () => {
  it("shares one current-generation refresh and retries each GET once", async () => {
    const auth = fixture();
    authenticatedStorage(auth.secure, auth.installation);
    const refresh = deferred<ReturnType<typeof response>>();
    const refreshStarted = deferred<void>();
    auth.transport.refreshResult = refresh.promise;
    auth.transport.refreshStarted = () => refreshStarted.resolve();
    const attempts = new Map<string, number>();
    const execute = vi.fn(async ({ path }: { path: string }) => {
      const count = (attempts.get(path) ?? 0) + 1;
      attempts.set(path, count);
      return count === 1
        ? {
            payload: {
              code: "STAFF_AUTHENTICATION_REQUIRED",
              message: "expired",
            },
            status: 401,
          }
        : { payload: { path }, status: 200 };
    });
    const client = new EmployeeClient({
      authorizationRecovery: {
        allowRefresh: true,
        refreshAuthorization: async () => {
          const result = await auth.session.refresh();
          return result === "stale" ? "transient-failure" : result;
        },
      },
      transport: { execute },
    });

    const first = client.request({ method: "GET", path: "/context" });
    const second = client.request({ method: "GET", path: "/queue" });
    await refreshStarted.promise;
    expect(auth.transport.refreshCalls).toEqual([refresh0]);
    refresh.resolve(response());
    await expect(Promise.all([first, second])).resolves.toEqual([
      { path: "/context" },
      { path: "/queue" },
    ]);
    expect(execute).toHaveBeenCalledTimes(4);
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  accessNew,
  authResponse,
  denied,
  drain,
  notificationAuthFixture,
  refreshNew,
  registration,
} from "./native-notification-auth-fixture";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Issue #405 native GET / push PUT authentication recovery", () => {
  it.each(["before", "after", "same-turn"] as const)(
    "preserves the session when PUT 401 completes %s refresh",
    async (ordering) => {
      const test = await notificationAuthFixture();
      const generation = test.auth.current().authGeneration;
      const read = test
        .client()
        .request({ method: "GET", path: "/v1/staff/operational-context" })
        .catch((error: unknown) => error);
      await test.refreshStarted.promise;
      const put = test.push
        .reconcile(registration)
        .catch((error: unknown) => error);
      await test.putStarted.promise;
      if (ordering === "after") {
        test.refreshResponse.resolve(Response.json(authResponse()));
        await read;
      }
      test.putResponse.resolve(denied());
      if (ordering === "before") await drain();
      const generationBeforeRefresh = test.auth.current().authGeneration;
      test.refreshResponse.resolve(Response.json(authResponse()));
      const [readResult, putResult] = await Promise.all([read, put]);
      await drain();

      expect(
        test.calls.filter((call) => call.path.endsWith("/logout")),
      ).toHaveLength(0);
      expect(generationBeforeRefresh).toBe(generation);
      expect(readResult).toEqual({ current: true });
      expect(putResult).toMatchObject({ status: 401 });
      expect(test.auth.current()).toMatchObject({
        authGeneration: generation,
        phase: "authenticated",
      });
      expect(test.auth.getAccessToken()).toBe(accessNew);
      expect(test.secure()?.refreshToken).toBe(refreshNew);
      expect(test.installation()?.restoreBlocked).toBe(false);
      expect(test.purges()).toBe(0);
      expect(
        test.calls.filter((call) => call.path.endsWith("/refresh")),
      ).toHaveLength(1);
      expect(test.calls.filter((call) => call.method === "PUT")).toHaveLength(
        1,
      );
    },
  );
});

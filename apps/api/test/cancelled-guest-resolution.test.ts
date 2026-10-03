import { describe, expect, it, vi } from "vitest";
import { resolveGuestAccessWithDatabase } from "../src/modules/valet-sessions/guest-access-resolver";
import { resolveAndLockGuestAccessSession } from "../src/modules/valet-sessions/guest-access-session-resolution";
import * as projection from "../src/modules/valet-sessions/guest-safe-session";

describe("CANCELLED bearer rejection before projection", () => {
  it.each([resolveGuestAccessWithDatabase, resolveAndLockGuestAccessSession])(
    "%s never projects a CANCELLED session or relies on response validation",
    async (resolver) => {
      const project = vi.spyOn(projection, "projectGuestSafeSession");
      const query = vi
        .fn()
        .mockResolvedValue({ rows: [{ state: "CANCELLED" }] });
      await expect(
        resolver({ query } as never, "a".repeat(43)),
      ).rejects.toMatchObject({ code: "GUEST_ACCESS_INVALID" });
      expect(project).not.toHaveBeenCalled();
      expect(query.mock.calls[0]?.[0]).toContain(
        "session.state <> 'CANCELLED'",
      );
      project.mockRestore();
    },
  );
});

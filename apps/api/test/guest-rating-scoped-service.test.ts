import { describe, expect, it, vi } from "vitest";

import type { PostgresPool } from "../src/common/database/postgres";
import { AntiAbuseUnavailableError, type AntiAbuseService } from "../src/modules/anti-abuse/anti-abuse.service";
import type { GuestAccessService } from "../src/modules/guest-access/guest-access.service";
import { GuestRatingService } from "../src/modules/guest-access/guest-rating.service";
import type { LockedGuestAccessSessionScope } from "../src/modules/valet-sessions/guest-access-session-resolution";

const visit = "00000000-0000-4000-8000-000000000003";
const otherVisit = "00000000-0000-4000-8000-000000000009";
const session: LockedGuestAccessSessionScope = {
  completedAt: new Date("2026-11-27T09:00:00.000Z"),
  customerId: null,
  guestVehicleReadyNotificationEnabled: true,
  locationId: "00000000-0000-4000-8000-000000000002",
  organizationId: "00000000-0000-4000-8000-000000000001",
  readyAt: "2026-11-27T08:00:00.000Z",
  retrievalRequestedAt: new Date("2026-11-27T07:00:00.000Z"),
  state: "COMPLETED",
  valetSessionId: visit,
  vehicle: { color: null, make: null, model: null },
  version: 10,
};

const bearer = "A".repeat(43);
const reservation = {
  id: "safe-test-reservation",
  key: {
    keyHash: "test", lockHigh: 1, lockLow: 2,
    scope: "v1:guest-client-address" as const,
  },
};

function fixture(code: string, failingFinalization = false) {
  const query = vi.fn(async (sql: string) => {
    if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") return {};
    return {
      rows: [{
        result_code: code,
        rated_at: code === "OK" ? new Date("2026-11-27T10:00:00.000Z") : null,
        rating: code === "OK" ? 4 : null,
        valet_session_id: code === "OK" ? visit : null,
      }],
    };
  });
  const release = vi.fn();
  const pool = {
    connect: vi.fn().mockResolvedValue({ query, release }),
  } as unknown as PostgresPool;
  const finalizeInTransaction = failingFinalization
    ? vi.fn().mockRejectedValue(new Error("synthetic finalize failure"))
    : vi.fn().mockResolvedValue(undefined);
  const antiAbuse = { finalizeInTransaction } as unknown as AntiAbuseService;
  const resolveAndLockCredentialInTransaction = vi.fn().mockResolvedValue({
    scope: "POST_VISIT", session,
  });
  const guestAccess = {
    resolveAndLockCredentialInTransaction,
  } as unknown as GuestAccessService;
  return {
    service: new GuestRatingService(pool, antiAbuse, guestAccess),
    query, release, finalizeInTransaction, resolveAndLockCredentialInTransaction,
  };
}

describe("Issue #463 scoped GuestRatingService atomic transaction policy", () => {
  it("writes the 4arg canonical pair and finalizes anti-abuse in the same COMMIT", async () => {
    const target = fixture("OK");
    const output = await target.service.submit(reservation, bearer, 4, {
      expectedValetSessionId: visit, comment: "مرحبا\nWorks",
    });
    expect(output).toEqual({
      rating: 4, ratedAt: "2026-11-27T10:00:00.000Z",
      valetSessionId: visit,
    });
    const sql = target.query.mock.calls.map((call) => call[0]);
    expect(sql.some((statement) => statement.includes(
      "public.guest_rating_submit($1, $2, $3, $4",
    ))).toBe(true);
    expect(sql).toContain("COMMIT");
    expect(sql).not.toContain("ROLLBACK");
    expect(target.finalizeInTransaction).toHaveBeenCalledWith(
      expect.anything(), reservation, "IGNORED",
    );
    expect(target.resolveAndLockCredentialInTransaction).toHaveBeenCalledWith(
      expect.anything(), bearer, true,
    );
  });

  it("denies a swapped expected visit without calling rating SQL", async () => {
    const target = fixture("OK");
    await expect(target.service.submit(reservation, bearer, 4, {
      expectedValetSessionId: otherVisit, comment: "private",
    })).rejects.toMatchObject({ code: "GUEST_ACCESS_INVALID" });
    expect(target.query.mock.calls.map((call) => call[0]).join(" ")).not
      .toContain("guest_rating_submit");
    expect(target.finalizeInTransaction).toHaveBeenCalledWith(
      expect.anything(), reservation, "COUNTED",
    );
  });

  it.each(["REQUEST_INVALID", "FEEDBACK_UNAVAILABLE"])(
    "handles SQL %s as definite 400 after counted anti-abuse finalization",
    async (code) => {
      const target = fixture(code);
      await expect(target.service.submit(reservation, bearer, 4, {
        expectedValetSessionId: visit, comment: "private",
      })).rejects.toMatchObject({ name: "ApiTransportValidationError" });
      expect(target.finalizeInTransaction).toHaveBeenCalledWith(
        expect.anything(), reservation, "COUNTED",
      );
      expect(target.query).toHaveBeenCalledWith("COMMIT");
    },
  );

  it("rolls back the entire SQL write if anti-abuse finalization fails", async () => {
    const target = fixture("OK", true);
    await expect(target.service.submit(reservation, bearer, 4, {
      expectedValetSessionId: visit, comment: "private",
    })).rejects.toBeInstanceOf(AntiAbuseUnavailableError);
    expect(target.query).toHaveBeenCalledWith("ROLLBACK");
    expect(target.query).not.toHaveBeenCalledWith("COMMIT");
    expect(target.release).toHaveBeenCalledOnce();
  });

  it("preserves 2arg legacy service dispatch", async () => {
    const target = fixture("OK");
    await target.service.submit(reservation, bearer, 4);
    const sql = target.query.mock.calls.map((call) => call[0]).join(" ");
    expect(sql).toContain("public.guest_rating_submit($1, $2)");
    expect(sql).not.toContain("public.guest_rating_submit($1, $2, $3, $4)");
  });
});

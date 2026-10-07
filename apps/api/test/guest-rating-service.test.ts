import { describe, expect, it, vi } from "vitest";

import type { PostgresPool } from "../src/common/database/postgres";
import type { AntiAbuseService } from "../src/modules/anti-abuse/anti-abuse.service";
import type { GuestAccessService } from "../src/modules/guest-access/guest-access.service";
import { GuestRatingService } from "../src/modules/guest-access/guest-rating.service";
import type { LockedGuestAccessSessionScope } from "../src/modules/valet-sessions/guest-access-session-resolution";

const session: LockedGuestAccessSessionScope = {
  completedAt: new Date("2026-09-17T20:00:00.000Z"),
  customerId: null,
  guestVehicleReadyNotificationEnabled: true,
  locationId: "00000000-0000-4000-8000-000000000002",
  organizationId: "00000000-0000-4000-8000-000000000001",
  readyAt: "2026-09-17T19:00:00.000Z",
  retrievalRequestedAt: new Date("2026-09-17T18:00:00.000Z"),
  state: "COMPLETED",
  valetSessionId: "00000000-0000-4000-8000-000000000003",
  vehicle: { color: null, make: null, model: null },
  version: 10,
};

describe("GuestRatingService second-stage Guest authorization", () => {
  it("counts a database revalidation failure and returns Guest Access invalid", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") return {};
      return {
        rows: [
          {
            rated_at: null,
            rating: null,
            result_code: "INVALID_ACCESS",
            valet_session_id: null,
          },
        ],
      };
    });
    const release = vi.fn();
    const pool = {
      connect: vi.fn().mockResolvedValue({ query, release }),
    } as unknown as PostgresPool;
    const finalizeInTransaction = vi.fn().mockResolvedValue(undefined);
    const antiAbuse = { finalizeInTransaction } as unknown as AntiAbuseService;
    const guestAccess = {
      resolveAndLockCredentialInTransaction: vi
        .fn()
        .mockResolvedValue({ scope: "POST_VISIT", session }),
    } as unknown as GuestAccessService;
    const service = new GuestRatingService(pool, antiAbuse, guestAccess);
    const reservation = {
      id: "reservation",
      key: {
        keyHash: "key",
        lockHigh: 1,
        lockLow: 2,
        scope: "v1:guest-client-address" as const,
      },
    };

    await expect(service.submit(reservation, "A".repeat(43), 5)).rejects.toMatchObject({
      code: "GUEST_ACCESS_INVALID",
    });
    expect(finalizeInTransaction).toHaveBeenCalledWith(
      expect.anything(),
      reservation,
      "COUNTED",
    );
    expect(query).toHaveBeenCalledWith("COMMIT");
    expect(release).toHaveBeenCalledOnce();
  });
});

import { describe, expect, it, vi } from "vitest";

import type { PostgresTransaction } from "../src/common/database/postgres";
import { GuestAccessError } from "../src/modules/valet-sessions/guest-access-command";
import type { LockedGuestAccessSessionScope } from "../src/modules/valet-sessions/guest-access-session-resolution";
import { submitGuestRating } from "../src/modules/guest-access/guest-rating-command";

const completedSession: LockedGuestAccessSessionScope = {
  completedAt: new Date("2026-09-17T20:00:00.000Z"),
  customerId: null,
  guestVehicleReadyNotificationEnabled: true,
  locationId: "00000000-0000-4000-8000-000000000002",
  organizationId: "00000000-0000-4000-8000-000000000001",
  readyAt: "2026-09-17T19:00:00.000Z",
  retrievalRequestedAt: new Date("2026-09-17T18:00:00.000Z"),
  state: "COMPLETED",
  valetSessionId: "00000000-0000-4000-8000-000000000003",
  vehicle: { color: "Black", make: "Toyota", model: "Camry" },
  version: 10,
};

describe("Guest Rating database command mapping", () => {
  it("maps a second-stage authorization failure back to Guest Access invalid", async () => {
    const transaction = {
      query: vi.fn().mockResolvedValue({
        rows: [
          {
            rated_at: null,
            rating: null,
            result_code: "INVALID_ACCESS",
            valet_session_id: null,
          },
        ],
      }),
    } as unknown as PostgresTransaction;

    await expect(
      submitGuestRating(transaction, "A".repeat(43), completedSession, 5),
    ).rejects.toBeInstanceOf(GuestAccessError);
  });
});

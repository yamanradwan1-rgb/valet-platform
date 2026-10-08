import { describe, expect, it, vi } from "vitest";

import { persistGuestReadyPush } from "../src/modules/retrieval/mark-ready-guest-push";

describe("Mark Ready Guest Push transaction hook", () => {
  it("persists the exact READY intent through the transaction-scoped DB function", async () => {
    const query = vi.fn(async () => ({ rows: [], rowCount: 0 }));
    const readyAt = new Date("2026-10-08T20:00:00.000Z");
    const session = {
      id: "33333333-3333-4333-8333-333333333333",
      key_slot_id: null,
      location_id: "22222222-2222-4222-8222-222222222222",
      organization_id: "11111111-1111-4111-8111-111111111111",
      parking_spot_id: null,
      parking_zone_id: null,
      ready_at: null,
      retrieval_requested_at: new Date(),
      retrieval_started_at: new Date(),
      state: "RETRIEVING",
      version: 4,
    };

    await persistGuestReadyPush({ query } as never, session, readyAt);

    expect(query).toHaveBeenCalledOnce();
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("guest_push_ready_intent_v1($1,$2,$3,$4)"),
      [session.organization_id, session.location_id, session.id, readyAt],
    );
  });
});

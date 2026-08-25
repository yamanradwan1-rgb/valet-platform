import { describe, expect, it } from "vitest";

import {
  bootstrapFailed,
  bootstrapSucceeded,
  createBootstrapLoadingState,
  selectAuthorizedLocation,
  revalidateSucceeded,
} from "./location-bootstrap-state";

const LOCATION_A = {
  currency: "JOD",
  locationId: "11111111-1111-4111-8111-111111111111",
  name: "Alpha Hotel",
  organizationId: "aaaaaaa1-1111-4111-8111-aaaaaaaaaaa1",
  timezone: "Asia/Amman",
};
const LOCATION_B = {
  currency: "USD",
  locationId: "22222222-2222-4222-8222-222222222222",
  name: "Beta Mall",
  organizationId: "aaaaaaa1-1111-4111-8111-aaaaaaaaaaa1",
  timezone: "Asia/Amman",
};

describe("location bootstrap state machine", () => {
  it("keeps loading, error and ready-with-zero strictly distinct", () => {
    const loading = createBootstrapLoadingState();
    const failed = bootstrapFailed(new Error("network down"));
    const zero = bootstrapSucceeded([]);
    expect(loading).toEqual({ phase: "loading" });
    expect(failed.phase).toBe("error");
    expect(zero).toEqual({
      phase: "ready",
      locations: [],
      selectedId: null,
    });
    // A network failure is never an empty authorization list.
    expect(failed).not.toEqual(zero);
  });

  it("auto-selects the single authorized location", () => {
    const state = bootstrapSucceeded([LOCATION_A]);
    expect(state).toEqual({
      phase: "ready",
      locations: [LOCATION_A],
      selectedId: LOCATION_A.locationId,
    });
  });

  it("selects the deterministic backend-first entry for multiple locations", () => {
    const state = bootstrapSucceeded([LOCATION_A, LOCATION_B]);
    expect(state.phase).toBe("ready");
    if (state.phase !== "ready") return;
    expect(state.selectedId).toBe(LOCATION_A.locationId);
  });

  it("honors a preferred id ONLY while the fresh list still contains it", () => {
    const preferred = bootstrapSucceeded(
      [LOCATION_A, LOCATION_B],
      LOCATION_B.locationId,
    );
    if (preferred.phase !== "ready") throw new Error("expected ready");
    expect(preferred.selectedId).toBe(LOCATION_B.locationId);

    // Authorization drifted away: the stale preference is discarded and a
    // valid deterministic fallback is chosen instead.
    const drifted = bootstrapSucceeded([LOCATION_A], LOCATION_B.locationId);
    if (drifted.phase !== "ready") throw new Error("expected ready");
    expect(drifted.selectedId).toBe(LOCATION_A.locationId);

    // No authorized location at all anymore: no fake selection is created.
    const revoked = bootstrapSucceeded([], LOCATION_B.locationId);
    expect(revoked).toEqual({ phase: "ready", locations: [], selectedId: null });
  });

  it("ignores selections outside the authorized list", () => {
    const state = bootstrapSucceeded([LOCATION_A]);
    const unchanged = selectAuthorizedLocation(state, LOCATION_B.locationId);
    expect(unchanged).toBe(state);
    // Arbitrary hand-written ids can never be selected either.
    const arbitrary = selectAuthorizedLocation(
      state,
      "99999999-9999-4999-8999-999999999999",
    );
    expect(arbitrary).toBe(state);
  });

  it("accepts explicit selection of another authorized location", () => {
    const state = bootstrapSucceeded([LOCATION_A, LOCATION_B]);
    const switched = selectAuthorizedLocation(state, LOCATION_B.locationId);
    if (switched.phase !== "ready") throw new Error("expected ready");
    expect(switched.selectedId).toBe(LOCATION_B.locationId);
  });

  it("selection is a no-op while not ready", () => {
    expect(selectAuthorizedLocation(createBootstrapLoadingState(), "x")).toEqual({
      phase: "loading",
    });
  });

  it("revalidation keeps the current selection only while still authorized", () => {
    const current = bootstrapSucceeded([LOCATION_A, LOCATION_B]);
    const kept = revalidateSucceeded(current, [LOCATION_B]);
    if (kept.phase !== "ready") throw new Error("expected ready");
    expect(kept.selectedId).toBe(LOCATION_B.locationId);

    const fallback = revalidateSucceeded(current, [
      LOCATION_A,
      {
        ...LOCATION_B,
        locationId: "33333333-3333-4333-8333-333333333333",
        name: "Gamma Cafe",
      },
    ]);
    if (fallback.phase !== "ready") throw new Error("expected ready");
    expect(fallback.selectedId).toBe(LOCATION_A.locationId);
  });

  it("revalidation of a ready state downgrades honestly to zero access", () => {
    const current = bootstrapSucceeded([LOCATION_A]);
    const none = revalidateSucceeded(current, []);
    expect(none).toEqual({ phase: "ready", locations: [], selectedId: null });
  });

  it("revalidation before ready behaves like a fresh bootstrap", () => {
    const fresh = revalidateSucceeded(createBootstrapLoadingState(), [LOCATION_A]);
    if (fresh.phase !== "ready") throw new Error("expected ready");
    expect(fresh.selectedId).toBe(LOCATION_A.locationId);
  });
});

import { describe, expect, it } from "vitest";

import {
  conflictError,
  flush,
  Harness,
  LOCATION_A,
  readResponse,
  T1,
  T2,
  valueInvalidError,
} from "./branding-controller.test-support";

/**
 * Optimistic-concurrency pins for the Branding controller (D4-004),
 * mirroring the accepted concurrent-edit story: client gets T1 → another
 * actor updates (T2) → client mutates with T1 → backend 409 → UI shows the
 * conflict review posture → stale state is NOT relabeled saved → reload
 * brings T2/current values → user may deliberately resubmit from current
 * state. Cross-location race cases live in branding-controller-races.test.ts.
 */

describe("branding controller — concurrency lifecycle", () => {
  it("stores the authoritative token from GET", async () => {
    const harness = new Harness();
    await harness.loadAndSettle(LOCATION_A, T1);
    expect(harness.latest.phase).toBe("ready");
    expect(harness.latest.locationId).toBe(LOCATION_A);
    expect(harness.latest.data?.updatedAt).toBe(T1);
  });

  it("sends expectedUpdatedAt=T1 and applies the authoritative response verbatim", async () => {
    const harness = new Harness();
    await harness.loadAndSettle(LOCATION_A, T1);
    harness.controller.setOverride({
      setting: "brandDisplayName",
      value: "Nova Valet",
    });
    expect(harness.sets).toHaveLength(1);
    expect(harness.sets[0]?.request).toEqual({
      expectedUpdatedAt: T1,
      setting: "brandDisplayName",
      value: "Nova Valet",
    });
    // The mutation response IS a full read envelope with its own backend
    // truth (effective deliberately not derived client-side):
    harness.sets[0]!.resolve(
      readResponse(LOCATION_A, T2, {
        displayName: {
          effective: "Nova Valet",
          override: "Nova Valet",
          overridePresent: true,
        },
        primaryColor: { effective: "#FF0000" },
      }),
    );
    await flush();
    expect(harness.latest.conflict).toBeNull();
    expect(harness.latest.pendingMutation).toBeNull();
    expect(harness.latest.data?.updatedAt).toBe(T2);
    expect(harness.latest.data?.displayName.effective).toBe("Nova Valet");
    expect(harness.latest.data?.primaryColor.effective).toBe("#FF0000");
    expect(harness.latest.data?.primaryColor.overridePresent).toBe(false);
  });

  it("uses the ADVANCED token for the next mutation, never the old one", async () => {
    const harness = new Harness();
    await harness.loadAndSettle(LOCATION_A, T1);
    harness.controller.setOverride({ setting: "brandPrimaryColor", value: "#1122FF" });
    harness.sets[0]!.resolve(readResponse(LOCATION_A, T2));
    await flush();
    harness.controller.setOverride({
      setting: "brandDisplayName",
      value: "Second",
    });
    expect(harness.sets[1]?.request.expectedUpdatedAt).toBe(T2);
  });

  it("advances ONE shared token across BOTH settings (name then color)", async () => {
    const harness = new Harness();
    await harness.loadAndSettle(LOCATION_A, T1);
    // Edit display name with T1:
    harness.controller.setOverride({
      setting: "brandDisplayName",
      value: "Nova Valet",
    });
    expect(harness.sets[0]?.request.expectedUpdatedAt).toBe(T1);
    harness.sets[0]!.resolve(readResponse(LOCATION_A, T2));
    await flush();
    expect(harness.latest.data?.updatedAt).toBe(T2);
    // Editing the OTHER setting must send the advanced T2 — the token is
    // per-location, not per-setting:
    harness.controller.setOverride({
      setting: "brandPrimaryColor",
      value: "#1122FF",
    });
    expect(harness.sets[1]?.request.setting).toBe("brandPrimaryColor");
    expect(harness.sets[1]?.request.expectedUpdatedAt).toBe(T2);
  });

  it("409 on stale T1 → conflict posture, NO automatic retry", async () => {
    const harness = new Harness();
    await harness.loadAndSettle(LOCATION_A, T1); // Another actor now holds T2.
    harness.controller.setOverride({
      setting: "brandDisplayName",
      value: "Nova Valet",
    });
    harness.sets[0]!.reject(conflictError());
    await flush();
    // Stale data is not relabeled saved; intent preserved; no auto-overwrite:
    expect(harness.latest.phase).toBe("ready");
    expect(harness.latest.data?.updatedAt).toBe(T1);
    expect(harness.latest.data?.displayName.effective).toBe("Downtown Valet");
    expect(harness.latest.pendingMutation).toBeNull();
    expect(harness.latest.mutationError).toBeNull();
    expect(harness.latest.conflict?.attemptedRequest).toEqual({
      expectedUpdatedAt: T1,
      setting: "brandDisplayName",
      value: "Nova Valet",
    });
    // Exactly ONE request was made — never an automatic replay:
    expect(harness.sets).toHaveLength(1);
  });

  it("blocks further writes until reload brings authoritative current state", async () => {
    const harness = new Harness();
    await harness.loadAndSettle(LOCATION_A, T1);
    harness.controller.setOverride({ setting: "brandPrimaryColor", value: "#1122FF" });
    harness.sets[0]!.reject(conflictError());
    await flush();
    harness.controller.setOverride({
      setting: "brandPrimaryColor",
      value: "#3344FF",
    }); // blocked
    expect(harness.sets).toHaveLength(1); // Blocked attempt never sent.
    harness.controller.reload();
    harness.loads[1]!.resolve(readResponse(LOCATION_A, T2));
    await flush();
    expect(harness.latest.conflict).toBeNull();
    expect(harness.latest.data?.updatedAt).toBe(T2);
    // Deliberate resubmission FROM CURRENT STATE uses the fresh token:
    harness.controller.setOverride({
      setting: "brandPrimaryColor",
      value: "#3344FF",
    });
    expect(harness.sets[1]?.request.expectedUpdatedAt).toBe(T2);
    harness.sets[1]!.resolve(
      readResponse(LOCATION_A, "2026-08-01T12:00:00.000Z"),
    );
    await flush();
    expect(harness.latest.conflict).toBeNull();
  });

  it("non-conflict failures keep the token and stay dismissible", async () => {
    const harness = new Harness();
    await harness.loadAndSettle(LOCATION_A, T1);
    harness.controller.setOverride({
      setting: "brandDisplayName",
      value: "Nova Valet",
    });
    harness.sets[0]!.reject(valueInvalidError());
    await flush();
    expect(harness.latest.phase).toBe("ready");
    expect(harness.latest.data?.updatedAt).toBe(T1);
    expect(harness.latest.conflict).toBeNull();
    expect(harness.latest.mutationError).toEqual(valueInvalidError());
    harness.controller.dismissMutationError();
    expect(harness.latest.mutationError).toBeNull();
    // The SAME authoritative token is still in effect for the next write:
    harness.controller.setOverride({
      setting: "brandDisplayName",
      value: "Retry Nova",
    });
    expect(harness.sets[1]?.request.expectedUpdatedAt).toBe(T1);
  });

  it("runs mutations single-flight: a second write during a pending one is ignored", async () => {
    const harness = new Harness();
    await harness.loadAndSettle(LOCATION_A, T1);
    harness.controller.setOverride({ setting: "brandPrimaryColor", value: "#1122FF" });
    harness.controller.setOverride({ setting: "brandPrimaryColor", value: "#3344FF" });
    expect(harness.sets).toHaveLength(1);
    harness.sets[0]!.resolve(readResponse(LOCATION_A, T2));
    await flush();
    harness.controller.clearOverride("brandPrimaryColor");
    expect(harness.clears[0]?.request).toEqual({
      expectedUpdatedAt: T2,
      setting: "brandPrimaryColor",
    });
  });

  it("ignores mutations before the first load settles", () => {
    const harness = new Harness();
    harness.controller.load(LOCATION_A);
    harness.controller.setOverride({ setting: "brandDisplayName", value: "X" });
    harness.controller.clearOverride("brandDisplayName");
    expect(harness.sets).toHaveLength(0);
    expect(harness.clears).toHaveLength(0);
  });

  it("clear sends exactly {setting, expectedUpdatedAt}", async () => {
    const harness = new Harness();
    await harness.loadAndSettle(LOCATION_A, T1);
    harness.controller.clearOverride("brandDisplayName");
    expect(harness.clears[0]?.request).toEqual({
      expectedUpdatedAt: T1,
      setting: "brandDisplayName",
    });
    harness.clears[0]!.resolve(
      readResponse(LOCATION_A, T2, { displayName: { effective: "Downtown Valet" } }),
    );
    await flush();
    expect(harness.latest.data).toEqual(readResponse(LOCATION_A, T2));
  });
});

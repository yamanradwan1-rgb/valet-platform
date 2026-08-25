import { describe, expect, it } from "vitest";

import { DashboardApiError } from "../../lib/api/api-error";
import {
  conflictError,
  configuration,
  flush,
  Harness,
  LOCATION_A,
  LOCATION_B,
  mutationResponse,
  T1,
  T2,
} from "./configuration-controller.test-support";

/**
 * Concurrency + race pins for the Location Settings controller (D4-003),
 * mirroring the accepted concurrent-edit story: client gets T1 → another
 * actor updates (T2) → client mutates with T1 → backend 409 → UI shows
 * conflict → stale state is NOT labeled saved → reload gets T2/current
 * values → user may deliberately resubmit from current state.
 *
 * Cross-location pins: neither a late A success, nor a late A failure, nor a
 * late A 409 may leak into Location B's state in any direction.
 */

describe("location configuration controller", () => {
  it("stores the authoritative token from GET", async () => {
    const harness = new Harness();
    await harness.loadAndSettle(LOCATION_A, T1);
    expect(harness.latest.phase).toBe("ready");
    expect(harness.latest.locationId).toBe(LOCATION_A);
    expect(harness.latest.data?.updatedAt).toBe(T1);
  });

  it("sends expectedUpdatedAt=T1, advances to response T2 on success", async () => {
    const harness = new Harness();
    await harness.loadAndSettle(LOCATION_A, T1);
    harness.controller.setOverride({ setting: "tipsEnabled", value: false });
    expect(harness.sets).toHaveLength(1);
    expect(harness.sets[0]?.request).toEqual({
      expectedUpdatedAt: T1,
      setting: "tipsEnabled",
      value: false,
    });
    harness.sets[0]!.resolve(mutationResponse(T2));
    await flush();
    expect(harness.latest.conflict).toBeNull();
    expect(harness.latest.pendingMutation).toBeNull();
    expect(harness.latest.data?.updatedAt).toBe(T2);
    const tips = harness.latest.data?.settings.find(
      (entry) => entry.setting === "tipsEnabled",
    );
    expect(tips?.effective).toBe(false);
  });

  it("uses the ADVANCED token for the next mutation, never the old one", async () => {
    const harness = new Harness();
    await harness.loadAndSettle(LOCATION_A, T1);
    harness.controller.setOverride({ setting: "tipsEnabled", value: false });
    harness.sets[0]!.resolve(mutationResponse(T2));
    await flush();
    harness.controller.setOverride({ setting: "tipsEnabled", value: true });
    expect(harness.sets[1]?.request.expectedUpdatedAt).toBe(T2);
  });

  it("409 on stale T1 → conflict posture, NO automatic retry", async () => {
    const harness = new Harness();
    await harness.loadAndSettle(LOCATION_A, T1); // Another actor now holds T2.
    harness.controller.setOverride({ setting: "tipsEnabled", value: false });
    harness.sets[0]!.reject(conflictError());
    await flush();
    // Stale data is not relabeled saved; intent preserved; no auto-overwrite:
    expect(harness.latest.phase).toBe("ready");
    expect(harness.latest.data?.updatedAt).toBe(T1);
    expect(harness.latest.pendingMutation).toBeNull();
    expect(harness.latest.mutationError).toBeNull();
    expect(harness.latest.conflict?.attemptedRequest).toEqual({
      expectedUpdatedAt: T1,
      setting: "tipsEnabled",
      value: false,
    });
    expect(harness.sets).toHaveLength(1);
  });

  it("blocks further writes until reload brings authoritative current state", async () => {
    const harness = new Harness();
    await harness.loadAndSettle(LOCATION_A, T1);
    harness.controller.setOverride({ setting: "tipsEnabled", value: false });
    harness.sets[0]!.reject(conflictError());
    await flush();
    harness.controller.setOverride({ setting: "tipsEnabled", value: true }); // blocked
    harness.controller.reload();
    harness.loads[1]!.resolve(configuration(LOCATION_A, T2));
    await flush();
    expect(harness.sets).toHaveLength(1); // Blocked attempt never sent.
    expect(harness.latest.conflict).toBeNull();
    expect(harness.latest.data?.updatedAt).toBe(T2);
    // Deliberate resubmission FROM CURRENT STATE uses the fresh token:
    harness.controller.setOverride({ setting: "tipsEnabled", value: true });
    expect(harness.sets[1]?.request.expectedUpdatedAt).toBe(T2);
    harness.sets[1]!.resolve(mutationResponse(T2));
    await flush();
    expect(harness.latest.conflict).toBeNull();
  });

  it("A→B switch discards A state; late A PUT cannot touch B", async () => {
    const harness = new Harness();
    await harness.loadAndSettle(LOCATION_A, T1);
    harness.controller.setOverride({ setting: "tipsEnabled", value: false });
    harness.controller.load(LOCATION_B); // Discards A config/token/conflict.
    expect(harness.latest.locationId).toBe(LOCATION_B);
    expect(harness.latest.phase).toBe("loading");
    expect(harness.latest.data).toBeNull();
    // A's mutation may succeed server-side but must not mutate B UI state:
    harness.sets[0]!.resolve(mutationResponse(T2));
    await flush();
    expect(harness.latest.locationId).toBe(LOCATION_B);
    expect(harness.latest.data).toBeNull();
    // B loads with its own token; a B mutation uses TB, never TA/T2-of-A:
    const tokenB = "2026-08-02T09:00:00.000Z";
    harness.loads[1]!.resolve(configuration(LOCATION_B, tokenB));
    await flush();
    harness.controller.setOverride({ setting: "trackingEnabled", value: true });
    expect(harness.sets[1]?.locationId).toBe(LOCATION_B);
    expect(harness.sets[1]?.request.expectedUpdatedAt).toBe(tokenB);
  });

  it("A clear POST completing after B switch mutates no B UI", async () => {
    const harness = new Harness();
    await harness.loadAndSettle(LOCATION_A, T1);
    harness.controller.clearOverride("valetServiceFee");
    harness.controller.load(LOCATION_B);
    harness.clears[0]!.resolve(mutationResponse(T2, "valetServiceFee"));
    await flush();
    // Late A clear success is discarded wholesale:
    expect(harness.latest.locationId).toBe(LOCATION_B);
    expect(harness.latest.data).toBeNull();
    expect(harness.latest.conflict).toBeNull();
    expect(harness.latest.mutationError).toBeNull();
    // B proceeds with its own token for its own clear:
    const tokenB = "2026-08-03T08:00:00.000Z";
    harness.loads[1]!.resolve(configuration(LOCATION_B, tokenB));
    await flush();
    harness.controller.clearOverride("tipsEnabled");
    expect(harness.clears[1]?.locationId).toBe(LOCATION_B);
    expect(harness.clears[1]?.request).toEqual({
      expectedUpdatedAt: tokenB,
      setting: "tipsEnabled",
    });
  });

  it("A 409 arriving after B switch leaks nothing into B", async () => {
    const harness = new Harness();
    await harness.loadAndSettle(LOCATION_A, T1);
    harness.controller.setOverride({ setting: "tipsEnabled", value: false });
    harness.controller.load(LOCATION_B); // Switch BEFORE the 409 lands.
    harness.sets[0]!.reject(conflictError());
    await flush();
    // No A conflict banner/intent/blocked-write under B:
    expect(harness.latest.locationId).toBe(LOCATION_B);
    expect(harness.latest.conflict).toBeNull();
    expect(harness.latest.mutationError).toBeNull();
    // And B can mutate NORMALLY with its own token once loaded:
    const tokenB = "2026-08-04T07:00:00.000Z";
    harness.loads[1]!.resolve(configuration(LOCATION_B, tokenB));
    await flush();
    harness.controller.setOverride({ setting: "validationEnabled", value: true });
    expect(harness.sets[1]?.request.expectedUpdatedAt).toBe(tokenB);
  });

  it("a late superseded GET response is discarded entirely", async () => {
    const harness = new Harness();
    harness.controller.load(LOCATION_A);
    harness.controller.load(LOCATION_B); // Supersedes the A request identity.
    harness.loads[0]!.resolve(configuration(LOCATION_A, T1)); // Late A arrival.
    await flush();
    expect(harness.latest.phase).toBe("loading");
    expect(harness.latest.data).toBeNull();
    harness.loads[1]!.resolve(configuration(LOCATION_B, T2));
    await flush();
    expect(harness.latest.data?.locationId).toBe(LOCATION_B);
    expect(harness.latest.data?.updatedAt).toBe(T2);
  });

  it("enforces single-flight mutations", async () => {
    const harness = new Harness();
    await harness.loadAndSettle(LOCATION_A, T1);
    harness.controller.setOverride({ setting: "tipsEnabled", value: false });
    harness.controller.setOverride({ setting: "tipsEnabled", value: true });
    expect(harness.sets).toHaveLength(1);
  });

  it("ignores mutations before a ready snapshot exists", () => {
    const harness = new Harness();
    harness.controller.setOverride({ setting: "tipsEnabled", value: true });
    harness.controller.clearOverride("tipsEnabled");
    expect(harness.sets).toHaveLength(0);
    expect(harness.clears).toHaveLength(0);
  });

  it("surfaces non-conflict failures as dismissible retryable errors", async () => {
    const harness = new Harness();
    await harness.loadAndSettle(LOCATION_A, T1);
    harness.controller.setOverride({ setting: "valetServiceFee", value: "9.900" });
    harness.sets[0]!.reject(
      new DashboardApiError({
        code: "CONFIGURATION_VALUE_INVALID",
        kind: "validation",
        message: "Invalid location configuration value.",
        status: 400,
      }),
    );
    await flush();
    expect(harness.latest.mutationError).toBeInstanceOf(DashboardApiError);
    expect(harness.latest.conflict).toBeNull();
    expect(harness.latest.data?.updatedAt).toBe(T1); // Nothing faked.
    harness.controller.dismissMutationError();
    expect(harness.latest.mutationError).toBeNull();
  });

  it("clear sends the explicit payload and applies the cleared projection", async () => {
    const harness = new Harness();
    await harness.loadAndSettle(LOCATION_A, T1);
    harness.controller.clearOverride("valetServiceFee");
    expect(harness.clears[0]?.request).toEqual({
      expectedUpdatedAt: T1,
      setting: "valetServiceFee",
    });
    harness.clears[0]!.resolve(mutationResponse(T2, "valetServiceFee"));
    await flush();
    expect(harness.latest.data?.updatedAt).toBe(T2);
  });
});

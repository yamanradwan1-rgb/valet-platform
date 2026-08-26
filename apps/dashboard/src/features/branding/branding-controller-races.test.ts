import { describe, expect, it } from "vitest";

import {
  conflictError,
  flush,
  Harness,
  LOCATION_A,
  LOCATION_B,
  networkError,
  readResponse,
  T1,
  T2,
} from "./branding-controller.test-support";

/**
 * Cross-location race pins for the Branding controller (D4-004): neither a
 * late A success, nor a late A failure, nor a late A 409 may leak into
 * Location B's state in any direction; A's updatedAt token is never reused
 * for B; superseded loads are aborted and discarded.
 */

const TOKEN_B = "2026-08-02T09:00:00.000Z";

describe("branding controller — location switch races", () => {
  it("A→B switch discards A state; late A PUT success cannot touch B", async () => {
    const harness = new Harness();
    await harness.loadAndSettle(LOCATION_A, T1);
    harness.controller.setOverride({
      setting: "brandDisplayName",
      value: "Nova Valet",
    });
    harness.controller.load(LOCATION_B); // Discards A config/token/conflict.
    expect(harness.latest.locationId).toBe(LOCATION_B);
    expect(harness.latest.phase).toBe("loading");
    expect(harness.latest.data).toBeNull();
    // A's mutation may succeed server-side but must not mutate B UI state:
    harness.sets[0]!.resolve(
      readResponse(LOCATION_A, T2, {
        displayName: { effective: "Nova Valet", overridePresent: true },
      }),
    );
    await flush();
    expect(harness.latest.locationId).toBe(LOCATION_B);
    expect(harness.latest.data).toBeNull();
    // B loads with its own token; a B mutation uses TB, never T1/T2-of-A:
    harness.loads[1]!.resolve(readResponse(LOCATION_B, TOKEN_B));
    await flush();
    expect(harness.latest.phase).toBe("ready");
    expect(harness.latest.data?.updatedAt).toBe(TOKEN_B);
    harness.controller.setOverride({
      setting: "brandPrimaryColor",
      value: "#1122FF",
    });
    expect(harness.sets[1]?.locationId).toBe(LOCATION_B);
    expect(harness.sets[1]?.request.expectedUpdatedAt).toBe(TOKEN_B);
  });

  it("late A 409 arriving after B switch leaks nothing into B", async () => {
    const harness = new Harness();
    await harness.loadAndSettle(LOCATION_A, T1);
    harness.controller.setOverride({ setting: "brandPrimaryColor", value: "#1122FF" });
    harness.controller.load(LOCATION_B); // Switch BEFORE the 409 lands.
    harness.sets[0]!.reject(conflictError());
    await flush();
    // No A conflict banner/intent/blocked-write under B:
    expect(harness.latest.locationId).toBe(LOCATION_B);
    expect(harness.latest.conflict).toBeNull();
    expect(harness.latest.mutationError).toBeNull();
    expect(harness.latest.pendingMutation).toBeNull();
    // And B can mutate NORMALLY with its own token once loaded:
    harness.loads[1]!.resolve(readResponse(LOCATION_B, TOKEN_B));
    await flush();
    harness.controller.setOverride({
      setting: "brandDisplayName",
      value: "B Name",
    });
    expect(harness.sets[1]?.request.expectedUpdatedAt).toBe(TOKEN_B);
  });

  it("late A NETWORK failure after switch is discarded and never retried", async () => {
    const harness = new Harness();
    await harness.loadAndSettle(LOCATION_A, T1);
    harness.controller.setOverride({
      setting: "brandDisplayName",
      value: "Nova Valet",
    });
    harness.controller.load(LOCATION_B);
    harness.sets[0]!.reject(networkError());
    await flush();
    expect(harness.latest.locationId).toBe(LOCATION_B);
    expect(harness.latest.mutationError).toBeNull();
    expect(harness.latest.conflict).toBeNull();
    // No client-side retry of any kind happened:
    expect(harness.sets).toHaveLength(1);
  });

  it("A clear POST completing after B switch mutates no B UI", async () => {
    const harness = new Harness();
    await harness.loadAndSettle(LOCATION_A, T1);
    harness.controller.clearOverride("brandPrimaryColor");
    harness.controller.load(LOCATION_B);
    harness.clears[0]!.resolve(readResponse(LOCATION_A, T2));
    await flush();
    // Late A clear success is discarded wholesale:
    expect(harness.latest.locationId).toBe(LOCATION_B);
    expect(harness.latest.data).toBeNull();
    expect(harness.latest.conflict).toBeNull();
    expect(harness.latest.mutationError).toBeNull();
    // B proceeds with its own token for its own clear:
    harness.loads[1]!.resolve(readResponse(LOCATION_B, TOKEN_B));
    await flush();
    harness.controller.clearOverride("brandDisplayName");
    expect(harness.clears[1]?.locationId).toBe(LOCATION_B);
    expect(harness.clears[1]?.request).toEqual({
      expectedUpdatedAt: TOKEN_B,
      setting: "brandDisplayName",
    });
  });

  it("A clear 409 arriving after B switch leaks nothing into B", async () => {
    const harness = new Harness();
    await harness.loadAndSettle(LOCATION_A, T1);
    harness.controller.clearOverride("brandDisplayName");
    harness.controller.load(LOCATION_B); // Switch BEFORE the 409 lands.
    harness.clears[0]!.reject(conflictError());
    await flush();
    expect(harness.latest.locationId).toBe(LOCATION_B);
    expect(harness.latest.conflict).toBeNull();
    expect(harness.latest.mutationError).toBeNull();
    expect(harness.latest.data).toBeNull();
    // Exactly one A request was made — never replayed:
    expect(harness.clears).toHaveLength(1);
  });

  it("A clear NETWORK failure arriving after B switch is discarded, never retried", async () => {
    const harness = new Harness();
    await harness.loadAndSettle(LOCATION_A, T1);
    harness.controller.clearOverride("brandPrimaryColor");
    harness.controller.load(LOCATION_B);
    harness.clears[0]!.reject(networkError());
    await flush();
    expect(harness.latest.locationId).toBe(LOCATION_B);
    expect(harness.latest.mutationError).toBeNull();
    expect(harness.latest.conflict).toBeNull();
    // No client-side retry of any kind happened:
    expect(harness.clears).toHaveLength(1);
    expect(harness.sets).toHaveLength(0);
  });

  it("a superseded GET is aborted and its late response discarded", async () => {
    const harness = new Harness();
    harness.controller.load(LOCATION_A);
    harness.controller.load(LOCATION_B);
    // A's request was aborted the moment B became current:
    expect(harness.loads[0]?.signal.aborted).toBe(true);
    expect(harness.loads[1]?.signal.aborted).toBe(false);
    harness.loads[0]!.resolve(readResponse(LOCATION_A, T1));
    await flush();
    // The late A response must not become visible under B:
    expect(harness.latest.locationId).toBe(LOCATION_B);
    expect(harness.latest.phase).toBe("loading");
    expect(harness.latest.data).toBeNull();
    harness.loads[1]!.resolve(readResponse(LOCATION_B, TOKEN_B));
    await flush();
    expect(harness.latest.data?.locationId).toBe(LOCATION_B);
    expect(harness.latest.data?.updatedAt).toBe(TOKEN_B);
  });

  it("dispose aborts the in-flight load and freezes the snapshot", async () => {
    const harness = new Harness();
    harness.controller.load(LOCATION_A);
    harness.controller.dispose();
    expect(harness.loads[0]?.signal.aborted).toBe(true);
    harness.loads[0]!.resolve(readResponse(LOCATION_A, T1));
    await flush();
    expect(harness.snapshots.at(-1)?.phase).toBe("loading");
    expect(harness.latest.data).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { deriveProductionShellState } from "../src/shell/production-shell-controller";
import { auth, operations, scope } from "./production-shell-test-fixture";

describe("production shell visible state", () => {
  it("routes bootstrap restoration to a protected-content-free gate", () => {
    expect(
      deriveProductionShellState(
        auth("restoring"),
        operations("ready", { retainedScope: scope }),
      ),
    ).toEqual({ kind: "auth-restoring" });
  });

  it("routes completed bootstrap without credentials to login", () => {
    expect(
      deriveProductionShellState(
        auth("unauthenticated"),
        operations("inactive"),
      ),
    ).toEqual({
      kind: "logged-out",
    });
  });

  it("does not expose retained scope while current context is loading", () => {
    expect(
      deriveProductionShellState(
        auth("authenticated"),
        operations("loading-context", { retainedScope: scope }),
      ),
    ).toEqual({ kind: "context-loading" });
  });

  it("does not expose a scope from another auth generation", () => {
    expect(
      deriveProductionShellState(
        auth("authenticated", 2),
        operations("ready", { generation: 1, retainedScope: scope }),
      ),
    ).toEqual({ kind: "context-loading" });
  });

  it("renders authoritative access denial", () => {
    expect(
      deriveProductionShellState(
        auth("authenticated"),
        operations("error", { failureCode: "AUTHORIZATION_DENIED" }),
      ),
    ).toEqual({ kind: "access-denied" });
  });

  it("renders defensive empty-membership denial", () => {
    expect(
      deriveProductionShellState(
        auth("authenticated"),
        operations("access-denied"),
      ),
    ).toEqual({ kind: "access-denied" });
  });

  it("keeps no Location distinct from no active Shift", () => {
    expect(
      deriveProductionShellState(
        auth("authenticated"),
        operations("no-usable-location"),
      ),
    ).toEqual({ kind: "no-usable-location" });
    expect(
      deriveProductionShellState(
        auth("authenticated"),
        operations("no-active-shift"),
      ),
    ).toEqual({ kind: "no-active-shift" });
  });

  it("enters active scope only from a matching ready projection", () => {
    expect(
      deriveProductionShellState(auth("authenticated"), operations("ready")),
    ).toEqual({ kind: "active", scope });
  });

  it("renders operational and ambiguous-context errors truthfully", () => {
    expect(
      deriveProductionShellState(auth("authenticated"), operations("error")),
    ).toEqual({
      kind: "operational-error",
      message: null,
      reason: "unavailable",
    });
    expect(
      deriveProductionShellState(
        auth("authenticated"),
        operations("ambiguous-active-shifts"),
      ),
    ).toEqual({
      count: 2,
      kind: "operational-error",
      reason: "ambiguous-active-shifts",
    });
  });

  it("preserves truthful auth recovery and fatal states", () => {
    expect(
      deriveProductionShellState(
        auth("restoration-unavailable"),
        operations("inactive"),
      ),
    ).toEqual({ kind: "auth-recovery" });
    expect(
      deriveProductionShellState(auth("fatal"), operations("inactive")),
    ).toEqual({
      kind: "auth-error",
    });
  });
});

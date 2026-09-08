import type {
  EmployeeHandoffSnapshot,
  EmployeeReleaseSnapshot,
  EmployeeRetrievalSnapshot,
} from "@valet/employee-client";
import { describe, expect, it } from "vitest";

import { shouldShowNativeHandoff } from "../src/handoff/native-handoff-route-presentation";

function handoff(
  phase: EmployeeHandoffSnapshot["phase"],
  state?: "REQUESTED" | "READY" | "HANDOFF_PENDING",
) {
  return {
    phase,
    session: state === undefined ? null : { state },
  } as EmployeeHandoffSnapshot;
}

function retrieval(phase: EmployeeRetrievalSnapshot["phase"]) {
  return { phase } as EmployeeRetrievalSnapshot;
}

function release(phase: EmployeeReleaseSnapshot["phase"] = "inactive") {
  return { phase } as EmployeeReleaseSnapshot;
}

describe("MOB-014A Retrieval route continuation", () => {
  it("keeps earlier Retrieval physical states in their existing workflow", () => {
    expect(
      shouldShowNativeHandoff(
        handoff("conflict", "REQUESTED"),
        retrieval("key-checkout"),
        release(),
      ),
    ).toBe(false);
  });

  it("shows direct HANDOFF_PENDING loading and canonical Handoff state", () => {
    expect(
      shouldShowNativeHandoff(
        handoff("loading"),
        retrieval("inactive"),
        release(),
      ),
    ).toBe(true);
    expect(
      shouldShowNativeHandoff(
        handoff("pending", "HANDOFF_PENDING"),
        retrieval("inactive"),
        release(),
      ),
    ).toBe(true);
  });

  it("keeps a Handoff authority conflict visible after reassignment", () => {
    expect(
      shouldShowNativeHandoff(
        handoff("conflict", "HANDOFF_PENDING"),
        retrieval("ready"),
        release(),
      ),
    ).toBe(true);
  });

  it("shows handoff recovery when READY reconciliation is unavailable", () => {
    expect(
      shouldShowNativeHandoff(
        handoff("unavailable"),
        retrieval("ready"),
        release(),
      ),
    ).toBe(true);
  });

  it("keeps terminal release recovery visible after active Task disappearance", () => {
    expect(
      shouldShowNativeHandoff(
        handoff("conflict"),
        retrieval("inactive"),
        release("released"),
      ),
    ).toBe(true);
  });
});

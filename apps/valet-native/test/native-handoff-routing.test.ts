import type {
  EmployeeHandoffSnapshot,
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

describe("MOB-014A Retrieval route continuation", () => {
  it("keeps earlier Retrieval physical states in their existing workflow", () => {
    expect(
      shouldShowNativeHandoff(
        handoff("conflict", "REQUESTED"),
        retrieval("key-checkout"),
      ),
    ).toBe(false);
  });

  it("shows direct HANDOFF_PENDING loading and canonical Handoff state", () => {
    expect(
      shouldShowNativeHandoff(handoff("loading"), retrieval("inactive")),
    ).toBe(true);
    expect(
      shouldShowNativeHandoff(
        handoff("pending", "HANDOFF_PENDING"),
        retrieval("inactive"),
      ),
    ).toBe(true);
  });

  it("keeps a Handoff authority conflict visible after reassignment", () => {
    expect(
      shouldShowNativeHandoff(
        handoff("conflict", "HANDOFF_PENDING"),
        retrieval("ready"),
      ),
    ).toBe(true);
  });

  it("shows handoff recovery when READY reconciliation is unavailable", () => {
    expect(
      shouldShowNativeHandoff(handoff("unavailable"), retrieval("ready")),
    ).toBe(true);
  });
});

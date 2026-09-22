import { describe, expect, it } from "vitest";

import type { VisitContactCorrectionIntent } from "./visit-contact-correction-intent";
import {
  consumeVisitContactCorrectionRecovery,
  stageVisitContactCorrectionRecovery,
} from "./visit-contact-correction-recovery";

const intent: VisitContactCorrectionIntent = {
  clearName: false,
  customerId: "11111111-1111-4111-8111-111111111111",
  draft: "Preserved Draft",
  kind: "NAME",
  reviewRequired: false,
  sessionGeneration: 7,
};

describe("Visit Contact correction recovery", () => {
  it("is one-shot and forces authoritative review after recovery", () => {
    stageVisitContactCorrectionRecovery("scope-a", intent);
    expect(consumeVisitContactCorrectionRecovery("scope-a")).toEqual({
      ...intent,
      reviewRequired: true,
    });
    expect(consumeVisitContactCorrectionRecovery("scope-a")).toBeNull();
  });

  it("fails closed across a different identity or selected scope", () => {
    stageVisitContactCorrectionRecovery("scope-a", intent);
    expect(consumeVisitContactCorrectionRecovery("scope-b")).toBeNull();
    expect(consumeVisitContactCorrectionRecovery("scope-a")).toBeNull();
  });
});

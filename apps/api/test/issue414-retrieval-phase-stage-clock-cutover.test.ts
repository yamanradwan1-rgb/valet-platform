import { afterEach, describe, expect, it } from "vitest";

import {
  parseRetrievalPhaseStageClockCutover,
  requireRetrievalPhaseStageClockCutover,
} from "../src/modules/dashboard/management-alert-sources/retrieval-phase-stage-clock-cutover";

const stageKey = "MANAGEMENT_ALERTS_PHASE23_STAGE_POST_LOCK_CUTOVER";
const phaseOneKey = "MANAGEMENT_ALERTS_PHASE1_DISPATCH_POST_LOCK_CUTOVER";
const originalStage = process.env[stageKey];
const originalPhaseOne = process.env[phaseOneKey];

afterEach(() => {
  if (originalStage === undefined) delete process.env[stageKey];
  else process.env[stageKey] = originalStage;
  if (originalPhaseOne === undefined) delete process.env[phaseOneKey];
  else process.env[phaseOneKey] = originalPhaseOne;
});

describe("Issue #414 Stage release cutover is independent of Phase 1", () => {
  it("rejects absent Phase 2/3 gate even when Phase 1 is configured", () => {
    process.env[phaseOneKey] = "2026-11-04T12:00:00.000Z";
    delete process.env[stageKey];
    expect(() => requireRetrievalPhaseStageClockCutover())
      .toThrow("unavailable");
  });

  it("accepts only canonical millisecond UTC ISO from the separate stage key", () => {
    process.env[stageKey] = "2026-11-05T01:02:03.456Z";
    expect(requireRetrievalPhaseStageClockCutover().toISOString())
      .toBe("2026-11-05T01:02:03.456Z");
    // The Phase 1 gate must not influence source stage chronology.
    process.env[phaseOneKey] = "2020-01-01T00:00:00.000Z";
    expect(requireRetrievalPhaseStageClockCutover().toISOString())
      .toBe("2026-11-05T01:02:03.456Z");
  });

  it.each([
    "2026-11-05T01:02:03Z",
    "2026-11-05T01:02:03.456+00:00",
    "2026-02-30T12:00:00.000Z",
    "2026-11-05T01:02:03.456789Z",
    "invalid",
  ])("rejects non-canonical or impossible stage clock %s", (value) => {
    expect(() => parseRetrievalPhaseStageClockCutover(value)).toThrow();
  });
});

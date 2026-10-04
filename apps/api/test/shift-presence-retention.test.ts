import { describe, expect, it } from "vitest";

import {
  presenceChallengePurgeEligible, presenceHistoryPurgeAt,
  presenceOperationPurgeEligible, presenceRecoveryWindow,
} from "../src/modules/shifts/shift-presence-retention";

const terminal = new Date("2026-10-04T12:00:00Z");
const after = (days: number) => new Date(terminal.getTime() + days * 86_400_000);

describe("owner U257-RETENTION boundaries", () => {
  it("permits exact recovery only before day 14 and never replays", () => {
    expect(presenceRecoveryWindow(null, terminal)).toBe("PENDING");
    expect(presenceRecoveryWindow(terminal, terminal)).toBe("RECOVERABLE");
    expect(presenceRecoveryWindow(terminal, new Date(after(14).getTime() - 1))).toBe("RECOVERABLE");
    expect(presenceRecoveryWindow(terminal, after(14))).toBe("EXPIRED");
    expect(presenceRecoveryWindow(terminal, after(90))).toBe("EXPIRED");
  });
  it("retains minimal operation tombstone until day 90", () => {
    expect(presenceOperationPurgeEligible(null, after(1000))).toBe(false);
    expect(presenceOperationPurgeEligible(terminal, new Date(after(90).getTime() - 1))).toBe(false);
    expect(presenceOperationPurgeEligible(terminal, after(90))).toBe(true);
  });
  it("separates unconsumed challenge 24-hour grace from consumed non-secret linkage", () => {
    expect(presenceChallengePurgeEligible(terminal, null, new Date(after(1).getTime() - 1))).toBe(false);
    expect(presenceChallengePurgeEligible(terminal, null, after(1))).toBe(true);
    expect(presenceChallengePurgeEligible(after(1), terminal, terminal)).toBe(true);
  });
  it("uses UTC calendar months, clamps leap day and preserves time", () => {
    expect(presenceHistoryPurgeAt(terminal).toISOString()).toBe("2028-10-04T12:00:00.000Z");
    expect(presenceHistoryPurgeAt(new Date("2024-02-29T23:59:59.999Z")).toISOString()).toBe("2026-02-28T23:59:59.999Z");
    expect(() => presenceHistoryPurgeAt(new Date(NaN))).toThrow("PRESENCE_RETENTION_TIME_INVALID");
  });
});

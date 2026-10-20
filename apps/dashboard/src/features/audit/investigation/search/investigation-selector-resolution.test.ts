import { describe, expect, it } from "vitest";

import {
  resolveExactKeySlotCode,
  resolveLiveInvestigationSelectors,
  resolveSelectedMembership,
} from "./investigation-selector-resolution";

const memberId = "11111111-1111-4111-8111-111111111111";
const slotId = "22222222-2222-4222-8222-222222222222";
const otherId = "33333333-3333-4333-8333-333333333333";
const employees = [{ id: memberId, label: "Current directory member" }];
const slots = [{ id: slotId, label: "K-07" }];

describe("W5 canonical live selector resolution", () => {
  it("uses an exact code, not a current label as identifier", () => {
    expect(resolveExactKeySlotCode("K-07", slots)).toEqual({
      kind: "resolved",
      id: slotId,
    });
    expect(resolveExactKeySlotCode("k-07", slots)).toEqual({ kind: "missing" });
    expect(resolveExactKeySlotCode("", slots)).toEqual({ kind: "empty" });
    expect(
      resolveExactKeySlotCode("K-07", [
        ...slots,
        { id: otherId, label: "K-07" },
      ]),
    ).toEqual({ kind: "ambiguous" });
    expect(
      resolveExactKeySlotCode("K-07", [
        ...slots,
        { id: slotId, label: "K-07" },
      ]),
    ).toEqual({ kind: "resolved", id: slotId });
    expect(
      resolveExactKeySlotCode("K-07", [{ id: "not-a-uuid", label: "K-07" }]),
    ).toEqual({ kind: "missing" });
  });

  it("resolves only a selected canonical member UUID present in scoped options", () => {
    expect(resolveSelectedMembership(memberId, employees)).toEqual({
      kind: "resolved",
      id: memberId,
    });
    expect(resolveSelectedMembership("", employees)).toEqual({ kind: "empty" });
    expect(
      resolveSelectedMembership("Current directory member", employees),
    ).toEqual({
      kind: "missing",
    });
    expect(resolveSelectedMembership(otherId, employees)).toEqual({
      kind: "missing",
    });
  });

  it("refuses stale scope, ambiguous slot, partial bounded selector and absent options", () => {
    const input = {
      query: { slot: "K-07", employee: memberId },
      employeeOptions: employees,
      slotOptions: slots,
      scopeKey: "same-scope",
      employeeScopeKey: "same-scope",
      slotScopeKey: "same-scope",
      slotOptionsComplete: true,
    };
    expect(resolveLiveInvestigationSelectors(input)).toEqual({
      kind: "resolved",
      membershipId: memberId,
      keySlotId: slotId,
    });
    expect(
      resolveLiveInvestigationSelectors({
        ...input,
        slotScopeKey: "revoked",
      }),
    ).toEqual({ kind: "invalid", field: "scope", reason: "stale" });
    expect(
      resolveLiveInvestigationSelectors({
        ...input,
        slotOptionsComplete: false,
      }),
    ).toEqual({ kind: "invalid", field: "slot", reason: "incomplete" });
    expect(
      resolveLiveInvestigationSelectors({
        ...input,
        slotOptions: [...slots, { id: otherId, label: "K-07" }],
      }),
    ).toEqual({ kind: "invalid", field: "slot", reason: "ambiguous" });
    expect(
      resolveLiveInvestigationSelectors({
        ...input,
        employeeOptions: [],
      }),
    ).toEqual({ kind: "invalid", field: "employee", reason: "missing" });
    expect(
      resolveLiveInvestigationSelectors({
        ...input,
        query: { slot: "", employee: "" },
      }),
    ).toEqual({ kind: "resolved" });
  });
});

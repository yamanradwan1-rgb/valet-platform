import { describe, expect, it } from "vitest";
import {
  staffShiftForceEndRequestSchema as request,
  staffShiftForceEndResultSchema as result,
} from "./staff-shift-force-end.js";
import { managementAuditKnownDetailSchema } from "./management-audit.js";
import { managementAuditKnownEventTypeSchema } from "./management-audit-events.js";

const id = "d92c57dd-b859-4d14-9ab9-9de4dc0e8de3";
const command = {
  operationId: id,
  confirmation: "FORCE_END_SHIFT",
  reason: "  سبب — إبقاء العمل آمناً  ",
};
const closure = {
  operationId: id,
  shiftId: id,
  membershipId: id,
  locationId: id,
  status: "ENDED",
  startedAt: "2026-10-02T00:00:00.000Z",
  endedAt: "2026-10-02T01:00:00.000Z",
  closureKind: "ADMIN_FORCE_END",
  cashReconciliationState: "PENDING",
};

describe("T05-F strict Force End contracts", () => {
  it("trims only surrounding whitespace and preserves Unicode", () => {
    expect(request.parse(command).reason).toBe(command.reason.trim());
    expect(
      request.safeParse({ ...command, reason: "x".repeat(500) }).success,
    ).toBe(true);
  });
  it.each([
    { operationId: "invalid" },
    { confirmation: false },
    { confirmation: "" },
    { confirmation: undefined },
    { reason: " \uFEFF\n " },
    { reason: "x".repeat(501) },
    { confirmed: true },
    { cashReported: "0" },
    { reason: "😀".repeat(251) },
  ])("rejects malformed/extra command fields (%#)", (change) => {
    expect(request.safeParse({ ...command, ...change }).success).toBe(false);
  });
  it("requires authoritative administrative pending-cash result", () => {
    expect(result.safeParse(closure).success).toBe(true);
    for (const change of [
      { status: "ACTIVE" },
      { endedAt: undefined },
      { closureKind: "SELF_END" },
      { cashReconciliationState: "COMPLETE" },
      { cashReported: "0" },
      { reason: "private" },
    ])
      expect(result.safeParse({ ...closure, ...change }).success).toBe(false);
  });
  it("recognizes only bounded typed Shift audit detail", () => {
    expect(managementAuditKnownEventTypeSchema.parse("SHIFT_FORCE_ENDED")).toBe(
      "SHIFT_FORCE_ENDED",
    );
    const detail = {
      kind: "SHIFT",
      fromStatus: "ACTIVE",
      toStatus: "ENDED",
      closureKind: "ADMIN_FORCE_END",
      cashReconciliationState: "PENDING",
      targetMembershipId: id,
      operationId: id,
      reason: command.reason.trim(),
    };
    expect(managementAuditKnownDetailSchema.safeParse(detail).success).toBe(
      true,
    );
    expect(
      managementAuditKnownDetailSchema.safeParse({ ...detail, raw: {} })
        .success,
    ).toBe(false);
    expect(
      managementAuditKnownDetailSchema.safeParse({
        ...detail,
        reason: "x".repeat(501),
      }).success,
    ).toBe(false);
  });
});

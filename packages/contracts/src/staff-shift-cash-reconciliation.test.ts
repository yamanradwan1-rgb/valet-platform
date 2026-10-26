import { expect, it } from "vitest";
import { staffShiftCashReconciliationSchema } from "./staff-shift-cash-reconciliation.js";
import { staffShiftHistoryDetailQuerySchema } from "./staff-shift-history.js";

it("opts into financial detail without changing existing empty-query reads", () => {
  expect(staffShiftHistoryDetailQuerySchema.safeParse({}).success).toBe(true);
  expect(
    staffShiftHistoryDetailQuerySchema.safeParse({
      includeCashReconciliation: "true",
    }).success,
  ).toBe(true);
  expect(
    staffShiftHistoryDetailQuerySchema.safeParse({
      includeCashReconciliation: "false",
    }).success,
  ).toBe(false);
  expect(
    staffShiftHistoryDetailQuerySchema.safeParse({ cashExpected: "1.000" })
      .success,
  ).toBe(false);
});

it("accepts exact signed snapshots and rejects fabricated incomplete reports or extra private fields", () => {
  const snapshot = {
    cashExpected: "10.001",
    cashReported: "9.999",
    cashVariance: "-0.002",
    currency: "JOD",
    reportedAt: "2026-10-01T07:00:00.000Z",
    reportedBy: null,
  };
  expect(
    staffShiftCashReconciliationSchema.safeParse({
      state: "REPORTED",
      snapshot,
    }).success,
  ).toBe(true);
  expect(
    staffShiftCashReconciliationSchema.safeParse({
      state: "REPORTED",
      snapshot: null,
    }).success,
  ).toBe(false);
  expect(
    staffShiftCashReconciliationSchema.safeParse({
      state: "NOT_REPORTED",
      snapshot,
    }).success,
  ).toBe(false);
  expect(
    staffShiftCashReconciliationSchema.safeParse({
      state: "REPORTED",
      snapshot: { ...snapshot, membershipId: "private" },
    }).success,
  ).toBe(false);
  expect(
    staffShiftCashReconciliationSchema.safeParse({
      state: "PENDING",
      snapshot: null,
    }).success,
  ).toBe(true);
});

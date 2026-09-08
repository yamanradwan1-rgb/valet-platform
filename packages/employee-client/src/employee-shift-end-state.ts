import {
  endShiftRequestSchema,
  type EndShiftResponse,
  type StaffOperationalContextResponse,
} from "@valet/contracts";

import { EmployeeApiError } from "./api-error";
import type {
  EmployeeShiftEndAuthority,
  EmployeeShiftEndSnapshot,
} from "./employee-shift-end-types";

export function emptyEmployeeShiftEndSnapshot(
  identityGeneration: number | null = null,
  online = true,
): EmployeeShiftEndSnapshot {
  return {
    authority: null,
    cashInput: "",
    cashValidationVisible: false,
    failure: null,
    identityGeneration,
    online,
    phase: "inactive",
    result: null,
  };
}

export function normalizeEmployeeShiftCash(raw: string): string {
  return raw.trim();
}

export function isEmployeeShiftCashValid(raw: string): boolean {
  return endShiftRequestSchema.safeParse({
    cashReported: normalizeEmployeeShiftCash(raw),
  }).success;
}

export function resolveEmployeeShiftEndAuthority(
  identityGeneration: number,
  response: StaffOperationalContextResponse,
): EmployeeShiftEndAuthority | null {
  const active = response.contexts.filter(
    (context) =>
      context.activeShift !== null && context.currentLocation !== null,
  );
  if (active.length !== 1) return null;
  const context = active[0]!;
  return {
    currency: context.currentLocation!.currency,
    identityGeneration,
    locationCode: context.currentLocation!.code,
    locationId: context.currentLocation!.locationId,
    locationName: context.currentLocation!.name,
    membershipId: context.membershipId,
    organizationId: context.organization.organizationId,
    organizationName: context.organization.name,
    role: context.role,
    shiftId: context.activeShift!.shiftId,
    shiftStartedAt: context.activeShift!.startedAt,
  };
}

export function employeeShiftEndAuthorityKey(
  authority: EmployeeShiftEndAuthority,
): string {
  return [
    authority.identityGeneration,
    authority.organizationId,
    authority.membershipId,
    authority.locationId,
    authority.shiftId,
  ].join(":");
}

function canonicalMoney(value: string): string {
  const [whole, fraction = ""] = value.split(".");
  return `${whole}.${fraction.padEnd(3, "0")}`;
}

function moneyThousandths(value: string): bigint {
  const negative = value.startsWith("-");
  const unsigned = negative ? value.slice(1) : value;
  const [whole, fraction = ""] = unsigned.split(".");
  const amount = BigInt(whole!) * 1_000n + BigInt(fraction.padEnd(3, "0"));
  return negative ? -amount : amount;
}

export function validateEmployeeShiftEndResult(
  authority: EmployeeShiftEndAuthority,
  cashReported: string,
  result: EndShiftResponse,
): void {
  if (
    result.shiftId !== authority.shiftId ||
    result.locationId !== authority.locationId ||
    result.startedAt !== authority.shiftStartedAt ||
    result.status !== "ENDED" ||
    result.endedAt === null ||
    result.cashReconciliation.currency !== authority.currency ||
    canonicalMoney(result.cashReconciliation.cashReported) !==
      canonicalMoney(cashReported) ||
    moneyThousandths(result.cashReconciliation.cashReported) -
      moneyThousandths(result.cashReconciliation.cashExpected) !==
      moneyThousandths(result.cashReconciliation.cashVariance) ||
    result.cashReconciliation.reportedAt !== result.endedAt ||
    new Date(result.endedAt).getTime() < new Date(result.startedAt).getTime()
  ) {
    throw new EmployeeApiError({
      code: "SHIFT_END_RESPONSE_MISMATCH",
      message: "The Shift end result did not match the current Shift.",
      status: 502,
    });
  }
}

import { EmployeeApiError } from "./api-error";
import { operationalFailure } from "./employee-operational-recovery";
import {
  employeeShiftStartAuthorityKey,
  isSameEmployeeShiftStartAuthority,
  type EmployeeShiftStartAuthority,
  type EmployeeShiftStartContext,
} from "./employee-shift-start-context";
import type { EmployeeShiftStartSnapshot } from "./employee-shift-start-types";

export function emptyShiftStartSnapshot(): EmployeeShiftStartSnapshot {
  return {
    failure: null,
    identityGeneration: null,
    phase: "inactive",
    selectedLocationId: null,
    startableLocations: [],
    targetLocationId: null,
  };
}

export function suspendedShiftStartSnapshot(
  snapshot: EmployeeShiftStartSnapshot,
): EmployeeShiftStartSnapshot {
  return {
    ...snapshot,
    failure: {
      code: "SHIFT_START_RESULT_UNKNOWN",
      message: "The Shift start result could not be confirmed.",
    },
    phase: "uncertain",
  };
}

export function shiftStartAuthorities(
  context: EmployeeShiftStartContext,
  includeActive: boolean,
) {
  return new Map(
    [...context.startable, ...(includeActive ? context.active : [])].map(
      (authority) => [authority.location.locationId, authority],
    ),
  );
}

export function pendingStartResolution(
  context: EmployeeShiftStartContext,
  current: EmployeeShiftStartAuthority | undefined,
  attempt: EmployeeShiftStartAuthority,
  operationConfirmed: boolean,
  fenceDifferentActive: boolean,
): "confirmed" | "retired" | "pending" {
  const active = context.active.length === 1 ? context.active[0] : undefined;
  if (
    active &&
    operationConfirmed &&
    isSameEmployeeShiftStartAuthority(active, attempt)
  )
    return "confirmed";
  if (
    !current ||
    !isSameEmployeeShiftStartAuthority(current, attempt) ||
    (fenceDifferentActive &&
      context.active.some(
        (value) => !isSameEmployeeShiftStartAuthority(value, attempt),
      ))
  )
    return "retired";
  return "pending";
}

export function resolveShiftStartPresentation(
  identityGeneration: number | null,
  context: EmployeeShiftStartContext,
  authorities: Map<string, EmployeeShiftStartAuthority>,
  previousSelection: string | null,
  previousKey: string | null,
): { key: string | null; snapshot: EmployeeShiftStartSnapshot } {
  if (context.active.length > 0)
    return {
      key: null,
      snapshot: {
        ...emptyShiftStartSnapshot(),
        identityGeneration,
        phase: context.active.length === 1 ? "active" : "inactive",
      },
    };
  const retained =
    previousSelection === null ? undefined : authorities.get(previousSelection);
  const selected =
    retained !== undefined &&
    employeeShiftStartAuthorityKey(retained) === previousKey
      ? retained
      : context.startable.length === 1
        ? context.startable[0]
        : undefined;
  return {
    key: selected ? employeeShiftStartAuthorityKey(selected) : null,
    snapshot: {
      failure: null,
      identityGeneration,
      phase: "ready",
      selectedLocationId: selected?.location.locationId ?? null,
      startableLocations: context.startable.map(({ location }) => location),
      targetLocationId: null,
    },
  };
}

export function failedStartSnapshot(
  snapshot: EmployeeShiftStartSnapshot,
  error: unknown,
): EmployeeShiftStartSnapshot {
  return {
    ...snapshot,
    failure: operationalFailure(error),
    phase:
      error instanceof EmployeeApiError &&
      error.code === "ACTIVE_SHIFT_CONFLICT"
        ? "conflict"
        : error instanceof EmployeeApiError &&
            [401, 403, 404].includes(error.status)
          ? "denied"
          : "error",
    targetLocationId: null,
  };
}

import { auditInvestigationUuidSchema } from "@valet/contracts";

import type { InvestigationDemoQuery } from "../../investigation-demo-types";

/**
 * Current labels are supplied by the scoped API only. Labels are display
 * hints; only canonical UUIDs may cross the search transport boundary.
 */
export interface InvestigationSelectorOption {
  readonly id: string;
  readonly label: string;
}

export type InvestigationSelectorResolution =
  | { readonly kind: "resolved"; readonly id: string }
  | { readonly kind: "empty" }
  | { readonly kind: "missing" | "ambiguous" };

/** Exact code, never a fuzzy/case-insensitive historical slot inference. */
export function resolveExactKeySlotCode(
  code: string,
  options: readonly InvestigationSelectorOption[],
): InvestigationSelectorResolution {
  if (code.length === 0) return { kind: "empty" };
  const matches = options.filter((option) => option.label === code);
  const ids = new Set(matches.map((option) => option.id));
  if (!ids.size) return { kind: "missing" };
  if (ids.size !== 1) return { kind: "ambiguous" };
  const id = [...ids][0]!;
  return auditInvestigationUuidSchema.safeParse(id).success
    ? { kind: "resolved", id }
    : { kind: "missing" };
}

export function resolveSelectedMembership(
  selectedId: string,
  options: readonly InvestigationSelectorOption[],
): InvestigationSelectorResolution {
  if (!selectedId) return { kind: "empty" };
  const found = options.some((option) => option.id === selectedId);
  return found && auditInvestigationUuidSchema.safeParse(selectedId).success
    ? { kind: "resolved", id: selectedId }
    : { kind: "missing" };
}

export type LiveSelectionResult =
  | {
      readonly kind: "resolved";
      readonly membershipId?: string;
      readonly keySlotId?: string;
    }
  | {
      readonly kind: "invalid";
      readonly field: "scope" | "employee" | "slot";
      readonly reason: "stale" | "missing" | "ambiguous" | "incomplete";
    };

/**
 * Coordinator supplies a scope-key alongside EVERY selector response (same
 * identity/session/revision/location generation). Reject stale or incomplete
 * listings; one match in a partial bounded page is not proof of uniqueness.
 * Coordinator may fetch more pages or obtain server uniqueness evidence.
 */
export function resolveLiveInvestigationSelectors(input: {
  readonly query: Pick<InvestigationDemoQuery, "employee" | "slot">;
  readonly employeeOptions: readonly InvestigationSelectorOption[];
  readonly slotOptions: readonly InvestigationSelectorOption[];
  readonly scopeKey: string;
  readonly employeeScopeKey: string;
  readonly slotScopeKey: string;
  readonly slotOptionsComplete: boolean;
}): LiveSelectionResult {
  const {
    query,
    employeeOptions,
    slotOptions,
    scopeKey,
    employeeScopeKey,
    slotScopeKey,
    slotOptionsComplete,
  } = input;
  if (!scopeKey || scopeKey !== employeeScopeKey || scopeKey !== slotScopeKey) {
    return { kind: "invalid", field: "scope", reason: "stale" };
  }
  const employee = resolveSelectedMembership(query.employee, employeeOptions);
  if (employee.kind !== "resolved" && employee.kind !== "empty") {
    return { kind: "invalid", field: "employee", reason: employee.kind };
  }
  const slot = resolveExactKeySlotCode(query.slot, slotOptions);
  if (slot.kind !== "resolved" && slot.kind !== "empty") {
    return { kind: "invalid", field: "slot", reason: slot.kind };
  }
  if (slot.kind === "resolved" && !slotOptionsComplete) {
    return { kind: "invalid", field: "slot", reason: "incomplete" };
  }
  return {
    kind: "resolved",
    ...(employee.kind === "resolved" ? { membershipId: employee.id } : {}),
    ...(slot.kind === "resolved" ? { keySlotId: slot.id } : {}),
  };
}

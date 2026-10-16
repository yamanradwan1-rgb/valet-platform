import {
  shiftPresenceLocationSetRequestSchema,
  shiftPresenceLocationClearRequestSchema,
} from "@valet/contracts";
import type { PresenceApi, PresenceLocation } from "./shift-presence-api";
import {
  presenceFields, presencePolicyContext, presencePolicyIntent,
  presencePolicyFieldIdentity, isStrictPresenceMode,
  type Field, type PresencePolicyDrafts, type PresencePolicyIntent,
} from "./shift-presence-policy-fields";
import type { PresenceMutation } from "./use-shift-presence-mutation";
import { presenceId } from "./shift-presence-id";

export type GuidedAction = {
  readonly field: Field;
  readonly intent: Extract<PresencePolicyIntent, { kind: "SET" | "CLEAR" }>;
};
export interface GuidedPlan {
  readonly baseline: PresenceLocation;
  readonly drafts: PresencePolicyDrafts;
  readonly actions: readonly GuidedAction[];
  readonly all: readonly PresencePolicyIntent[];
}
export type GuidedStop =
  | "INVALID" | "CONFLICT" | "NOT_READY" | "BLOCKED"
  | "UNKNOWN" | "DENIED" | "CANCELLED" | "READ_FAILED";
export interface GuidedOutcome {
  readonly committed: readonly Field["field"][];
  readonly stopped: GuidedStop | null;
  readonly field?: Field["field"];
}

/** Evaluates only original, untouched draft identities against a server read. */
export function guidedPlan(
  baseline: PresenceLocation,
  drafts: PresencePolicyDrafts,
): GuidedPlan {
  const all = presenceFields.map((field) =>
    presencePolicyIntent(baseline, field, drafts[field.field]));
  return {
    baseline,
    drafts: { ...drafts },
    all,
    actions: presenceFields.flatMap((field, index) => {
      const intent = all[index]!;
      return intent.kind === "SET" || intent.kind === "CLEAR"
        ? [{ field, intent }] : [];
    }),
  };
}

export function guidedPlanError(plan: GuidedPlan): GuidedStop | null {
  if (plan.all.some((intent) => intent.kind === "INVALID")) return "INVALID";
  if (plan.all.some((intent) => intent.kind === "CONFLICT")) return "CONFLICT";
  return null;
}

/** Nonvolatile server projection; observedAt may refresh without changing policy. */
export function guidedServerSignature(data: PresenceLocation): string {
  return JSON.stringify({
    context: presencePolicyContext(data),
    company: data.company,
    overrides: data.overrides,
    effective: data.effective,
    zones: data.readiness.activeZoneCount,
    blockers: data.readiness.blockers,
    usable: data.readiness.configurationUsable,
    strictAllowed: data.readiness.strictActivationAllowed,
  });
}

export function guidedStrictBlocked(
  data: PresenceLocation,
  action: GuidedAction,
): boolean {
  const requested = action.intent.kind === "SET"
    ? action.intent.value : data.company[action.field.key];
  if (!isStrictPresenceMode(requested)) return false;
  return !data.readiness.configurationUsable ||
    !data.readiness.strictActivationAllowed ||
    data.readiness.activeZoneCount < 1 ||
    data.readiness.blockers.length > 0;
}

export interface GuidedApplyDeps {
  readonly api: PresenceApi;
  readonly mutation: Pick<PresenceMutation, "run" | "blocked" | "denied" | "pending">;
  readonly isCurrent: () => boolean;
  readonly onCommitted: (field: Field["field"], saved: PresenceLocation) => void;
}

/** No transaction across fields, no blind replay: each confirmed write is final. */
export async function applyGuidedPlan(
  reviewed: GuidedPlan,
  deps: GuidedApplyDeps,
): Promise<GuidedOutcome> {
  const committed: Field["field"][] = [];
  const stop = (stopped: GuidedStop, field?: Field["field"]): GuidedOutcome =>
    ({ committed: [...committed], stopped, ...(field ? { field } : {}) });
  if (!deps.isCurrent()) return stop("CANCELLED");
  if (deps.mutation.blocked) return stop("BLOCKED");
  if (guidedPlanError(reviewed)) return stop(guidedPlanError(reviewed)!);
  if (reviewed.actions.length === 0) return { committed, stopped: null };
  let expected = reviewed.baseline;
  for (const action of reviewed.actions) {
    if (!deps.isCurrent()) return stop("CANCELLED", action.field.field);
    if (deps.mutation.blocked) return stop("BLOCKED", action.field.field);
    let fresh: PresenceLocation;
    try {
      const value = await deps.api.policy();
      if (!deps.isCurrent()) return stop("CANCELLED", action.field.field);
      if (!("overrides" in value)) return stop("DENIED", action.field.field);
      fresh = value;
    } catch {
      return stop("READ_FAILED", action.field.field);
    }
    if (guidedServerSignature(fresh) !== guidedServerSignature(expected))
      return stop("CONFLICT", action.field.field);
    const original = reviewed.baseline;
    const field = action.field;
    // Only previous writes from this run can advance the CAS of other fields.
    if (fresh.effective[field.key] !== original.effective[field.key] ||
        fresh.overrides[field.override] !== original.overrides[field.override])
      return stop("CONFLICT", field.field);
    const draft = reviewed.drafts[field.field];
    if (!draft) return stop("CONFLICT", field.field);
    const rebased = {
      ...draft,
      baselineKey: presencePolicyFieldIdentity(
        presencePolicyContext(fresh),
        fresh.effective[field.key],
        fresh.overrides[field.override],
      ),
    };
    const intent = presencePolicyIntent(fresh, field, rebased);
    if (intent.kind !== action.intent.kind ||
        intent.proposedSource !== action.intent.proposedSource ||
        (intent.kind === "SET" && action.intent.kind === "SET" &&
          intent.value !== action.intent.value))
      return stop("CONFLICT", field.field);
    if (guidedStrictBlocked(fresh, action))
      return stop("NOT_READY", field.field);
    const mutationId = presenceId();
    const context = presencePolicyContext(fresh);
    const body = intent.kind === "SET"
      ? shiftPresenceLocationSetRequestSchema.parse({
          ...context, mutationId, field: field.field, value: intent.value,
        })
      : shiftPresenceLocationClearRequestSchema.parse({
          ...context, mutationId, field: field.field,
        });
    if (!deps.isCurrent() || deps.mutation.blocked)
      return stop("CANCELLED", field.field);
    const response = await deps.mutation.run(
      { mutationId, query: { kind: "POLICY" } },
      async () => ({
        kind: "POLICY" as const,
        value: intent.kind === "SET"
          ? await deps.api.setPolicy(body)
          : await deps.api.clearPolicy(body),
      }),
    );
    if (!deps.isCurrent()) return stop("CANCELLED", field.field);
    if (!response || response.kind !== "POLICY") {
      return stop(deps.mutation.denied ? "DENIED" :
        deps.mutation.pending ? "UNKNOWN" : "BLOCKED", field.field);
    }
    if (!("overrides" in response.value))
      return stop("DENIED", field.field);
    const saved = response.value;
    const savedOverride = saved.overrides[field.override];
    if ((intent.kind === "CLEAR" && savedOverride !== null) ||
        (intent.kind === "SET" && savedOverride !== intent.value))
      return stop("CONFLICT", field.field);
    committed.push(field.field);
    deps.onCommitted(field.field, saved);
    expected = saved;
  }
  return { committed, stopped: null };
}

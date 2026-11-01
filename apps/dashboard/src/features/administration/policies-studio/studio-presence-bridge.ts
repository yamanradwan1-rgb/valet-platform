import {
  presenceFields,
  presenceFieldSnapshot,
  presencePolicyContext,
  presencePolicyFieldIdentity,
  type Field,
  type PresencePolicyDraftState,
} from "../settings/shift-presence-policy-fields";
import { presenceCopy } from "../settings/shift-presence-copy";
import { presenceErrorKey } from "../settings/shift-presence-errors";
import type { PresenceWriteOutcome } from "./adapters/presence/presence-policy-adapter";
import type { usePoliciesStudioPresence } from "./adapters/presence/use-policies-studio-presence";
import type { Scalar } from "./ui/catalog";
import type { StudioPresenceData, StudioSaveResult } from "./ui/studio-types";

type PresenceRead = ReturnType<typeof usePoliciesStudioPresence>;
type PresenceValues = StudioPresenceData["values"];

const empty: PresenceValues = {
  defaults: {},
  overrides: {},
  effective: {},
  overridePresent: {},
};

function currentValues(read: PresenceRead): PresenceValues {
  const policy = read.snapshot.policy;
  if (!policy) return empty;
  const defaults: Record<string, Scalar> = {};
  const overrides: Record<string, Scalar> = {};
  const effective: Record<string, Scalar> = {};
  const overridePresent: Record<string, boolean> = {};
  for (const field of presenceFields) {
    const snapshot = presenceFieldSnapshot(policy, field);
    defaults[field.field] = snapshot.companyValue;
    effective[field.field] = snapshot.effectiveValue;
    overrides[field.field] = snapshot.override ?? null;
    overridePresent[field.field] = snapshot.override != null;
  }
  return { defaults, overrides, effective, overridePresent };
}

function result(outcome: PresenceWriteOutcome): StudioSaveResult {
  switch (outcome) {
    case "SAVED":
      return { ok: true };
    case "CONFLICT":
      return { ok: false, reason: "conflict" };
    case "INVALID":
    case "STRICT_CONFIRMATION_REQUIRED":
      return { ok: false, reason: "validation" };
    case "NO_CHANGE":
    case "BLOCKED":
    case "UNRESOLVED":
      return { ok: false, reason: "unavailable" };
  }
}

function policyDraft(
  read: PresenceRead,
  field: Field,
  value: Scalar,
  clear: boolean,
): PresencePolicyDraftState | null {
  const policy = read.snapshot.policy;
  if (!policy) return null;
  const current = presenceFieldSnapshot(policy, field);
  if (clear && current.location === null) return null;
  return {
    source: clear ? "INHERIT" : "CUSTOM",
    draft: String(value ?? ""),
    touched: true,
    baselineKey: presencePolicyFieldIdentity(
      presencePolicyContext(policy),
      current.effectiveValue,
      current.override,
    ),
    baselineValue: current.effectiveValue,
    baselineOverride: current.override,
  };
}

export function studioPresenceBridge(
  read: PresenceRead,
  locale: "ar" | "en",
): StudioPresenceData {
  const policy = read.snapshot.policy;
  const readiness = read.snapshot.readiness;
  const outcome = read.snapshot.mutationMessage;
  const readErrorKey = presenceErrorKey(read.snapshot.error);
  const mutationFailure =
    outcome === "failed" ||
    outcome === "unknown" ||
    outcome === "denied" ||
    outcome === "continuityUnavailable" ||
    outcome === "mfaRetry";
  const state = !readiness
    ? "UNKNOWN"
    : readiness.applicability === "NOT_APPLICABLE"
      ? "INACTIVE"
      : readiness.configurationUsable && readiness.strictActivationAllowed
        ? "READY"
        : "BLOCKED";
  return {
    readState: read.snapshot.readState,
    unavailable: !read.snapshot.available,
    values: currentValues(read),
    readiness: { state },
    zones: read.snapshot.zones,
    loading: read.snapshot.policyLoading || read.snapshot.zonesLoading,
    error:
      (read.snapshot.error
        ? presenceCopy(locale)(
            readErrorKey === "busyError" ? "readBusyError" : "failed",
          )
        : null) ??
      (outcome && mutationFailure ? presenceCopy(locale)(outcome) : null),
    editable: read.snapshot.canEdit,
    zonesEditable: read.snapshot.canEditZones,
    busy: read.snapshot.blocked,
    availableKeys: policy ? presenceFields.map((field) => field.field) : [],
    savePolicy: async (key, value, clear, strictConfirmed) => {
      if (!read.snapshot.canEdit) return { ok: false, reason: "forbidden" };
      const field = presenceFields.find((item) => item.field === key);
      if (!field) return { ok: false, reason: "validation" };
      const draft = policyDraft(read, field, value, clear);
      if (!draft) return { ok: false, reason: "validation" };
      return result(
        await read.actions.savePolicyDraft(field.field, draft, strictConfirmed),
      );
    },
    saveZone: async (zone) => {
      if (!read.snapshot.canEdit) return { ok: false, reason: "forbidden" };
      return result(await read.actions.saveZone(zone));
    },
  };
}

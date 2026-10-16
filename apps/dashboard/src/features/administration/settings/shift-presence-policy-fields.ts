import {
  shiftPresenceModeSchema,
  shiftPresenceAccuracyThresholdSchema,
  shiftPresenceAgeThresholdSchema,
} from "@valet/contracts";
import type { PresenceCompany, PresenceLocation } from "./shift-presence-api";
export const presenceFields = [
  {
    field: "shiftStartPresenceMode",
    key: "startMode",
    override: "startModeOverride",
    label: "start",
    help: "modeHelp",
  },
  {
    field: "shiftEndPresenceMode",
    key: "endMode",
    override: "endModeOverride",
    label: "end",
    help: "modeHelp",
  },
  {
    field: "shiftPresenceMaxAccuracyMeters",
    key: "maxAccuracyMeters",
    override: "maxAccuracyMetersOverride",
    label: "accuracy",
    help: "accuracyHelp",
  },
  {
    field: "shiftPresenceMaxFixAgeSeconds",
    key: "maxFixAgeSeconds",
    override: "maxFixAgeSecondsOverride",
    label: "age",
    help: "ageHelp",
  },
] as const;
export type Field = (typeof presenceFields)[number];

/** Ephemeral draft owned by the keyed Dashboard scope, never persisted by the client. */
export interface PresencePolicyDraftState {
  readonly draft: string;
  readonly touched: boolean;
  readonly baselineKey: string;
  readonly baselineValue: string | number;
  readonly baselineOverride: string | number | null | undefined;
}
export type PresencePolicyDrafts = Readonly<
  Partial<Record<Field["field"], PresencePolicyDraftState>>
>;

export function isStrictPresenceMode(value: string | number | null): boolean {
  return value === "REQUIRE" || value === "REQUIRE_OR_OVERRIDE";
}

/** A strict transition requires an explicit user confirmation, not client readiness inference. */
export function requiresStrictPresenceConfirmation(
  saved: string | number,
  proposed: string | number | null,
  clearOverride = false,
): boolean {
  return isStrictPresenceMode(proposed) && (saved !== proposed || clearOverride);
}

export function presencePolicyFieldIdentity(
  context: ReturnType<typeof presencePolicyContext>,
  effectiveValue: string | number,
  override: string | number | null | undefined,
): string {
  return JSON.stringify({ context, effectiveValue, override });
}

/** Saved values are a server projection; an unsaved draft never changes it. */
export function presenceFieldSnapshot(
  data: PresenceCompany | PresenceLocation,
  field: Field,
) {
  const location = "overrides" in data ? data : null;
  const company = "policy" in data ? data.policy : data.company;
  const companyValue = company[field.key];
  return {
    location,
    companyValue,
    effectiveValue: location ? location.effective[field.key] : companyValue,
    override: location ? location.overrides[field.override] : undefined,
  };
}

export function parsePresenceField(field: Field["field"], text: string) {
  if (text.trim() === "") return null;
  if (field !== "shiftStartPresenceMode" &&
      field !== "shiftEndPresenceMode" && !/^[0-9]+$/.test(text))
    return null;
  const parsed =
    field === "shiftStartPresenceMode" || field === "shiftEndPresenceMode"
      ? shiftPresenceModeSchema.safeParse(text)
      : field === "shiftPresenceMaxAccuracyMeters"
        ? shiftPresenceAccuracyThresholdSchema.safeParse(Number(text))
        : shiftPresenceAgeThresholdSchema.safeParse(Number(text));
  return parsed.success ? parsed.data : null;
}

export function presencePolicyContext(
  data: PresenceCompany | PresenceLocation,
) {
  const location = "overrides" in data ? data : null;
  const company = "policy" in data ? data.policy : data.company;
  return {
    expectedRevision: location ? location.overrides.revision : company.revision,
    ...(location
      ? {
          expectedCompanyRevision: company.revision,
          configurationFingerprint: location.readiness.configurationFingerprint,
        }
      : {}),
  };
}

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

export function parsePresenceField(field: Field["field"], text: string) {
  if (text.trim() === "") return null;
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

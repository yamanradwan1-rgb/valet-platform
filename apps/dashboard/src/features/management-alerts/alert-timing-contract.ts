import type { RuntimeSchema } from "../../lib/api/dashboard-api-client";

export const timingFields = [
  { key: "alt01GraceSeconds", category: "ALT-01", min: 0, max: 60, initial: 0 },
  { key: "alt02QueueSeconds", category: "ALT-02", min: 0, max: 300, initial: 60 },
  { key: "alt03DeclineSeconds", category: "ALT-03", min: 0, max: 120, initial: 0 },
  { key: "alt04StageSeconds", category: "ALT-04", min: 60, max: 900, initial: 300 },
  { key: "alt06HandoffSeconds", category: "ALT-06", min: 60, max: 900, initial: 300 },
  { key: "alt11UnknownPaymentSeconds", category: "ALT-11", min: 60, max: 600, initial: 120 },
] as const;

export type AlertTimingKey = (typeof timingFields)[number]["key"];
export type AlertTimingValues = Readonly<Record<AlertTimingKey, number>>;

export const defaultAlertTimingValues: AlertTimingValues = {
  alt01GraceSeconds: 0,
  alt02QueueSeconds: 60,
  alt03DeclineSeconds: 0,
  alt04StageSeconds: 300,
  alt06HandoffSeconds: 300,
  alt11UnknownPaymentSeconds: 120,
};

export interface AlertTimingPreferences {
  readonly organizationId: string;
  readonly userId: string;
  readonly revision: number;
  readonly updatedAt: string | null;
  readonly values: AlertTimingValues;
}
export function validAlertTimingValues(input: unknown): input is AlertTimingValues {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return false;
  const record = input as Record<string, unknown>;
  return Object.keys(record).length === timingFields.length && timingFields.every(
    ({ key, min, max }) =>
      Number.isInteger(record[key]) &&
      (record[key] as number) >= min &&
      (record[key] as number) <= max,
  );
}

export function timingPreferencesSchema(
  organizationId: string,
): RuntimeSchema<AlertTimingPreferences> {
  return {
    safeParse(value) {
      if (typeof value !== "object" || value === null) return { success: false };
      const data = value as Record<string, unknown>;
      if (
        data.organizationId !== organizationId ||
        typeof data.userId !== "string" || data.userId.length === 0 ||
        !Number.isSafeInteger(data.revision) || (data.revision as number) < 0 ||
        (data.updatedAt !== null && typeof data.updatedAt !== "string") ||
        !validAlertTimingValues(data.values)
      ) return { success: false };
      return { success: true, data: data as unknown as AlertTimingPreferences };
    },
  };
}

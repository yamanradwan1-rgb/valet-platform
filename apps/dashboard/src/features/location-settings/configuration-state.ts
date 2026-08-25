import type {
  ClearConfigurationOverrideRequest,
  ConfigurationMutationResponse,
  ConfigurationSettingKey,
  ConfigurationSettingProjection,
  LocationConfigurationResponse,
  SetConfigurationOverrideRequest,
} from "@valet/contracts";

import type { TranslationKey } from "../../i18n/translations/types";
import { DashboardApiError } from "../../lib/api/api-error";

/**
 * Pure Location Settings state rules (D4-003).
 *
 * The optimistic-concurrency contract lives here so it is directly testable:
 * - the envelope's `updatedAt` is the ONLY concurrency token;
 * - every mutation captures the CURRENT token verbatim into
 *   `expectedUpdatedAt` (never null, never refreshed silently);
 * - a successful mutation response REPLACES state from the authoritative
 *   backend payload and advances the stored token to the response token;
 * - nothing here ever recomputes `effective` — the backend-provided value is
 *   consumed directly;
 * - money stays an exact decimal STRING end to end (never Number()-parsed).
 */

/** Exactly the ten supported typed override settings, in display order. */
export const CONFIGURATION_SETTING_ORDER = [
  "checkInPhotosRequired",
  "handoffStandardMethodPolicy",
  "trackingEnabled",
  "rawGpsRetentionDays",
  "valetServiceFee",
  "paymentServicePayer",
  "paymentMethodsPolicy",
  "tipsEnabled",
  "validationEnabled",
  "releaseRequiresPayment",
] as const satisfies readonly ConfigurationSettingKey[];

const SUPPORTED_SETTING_KEYS: ReadonlySet<string> = new Set(
  CONFIGURATION_SETTING_ORDER,
);

/** True only for the ten contract settings; founder/Category-B ideas fail. */
export function isSupportedConfigurationSetting(key: string): boolean {
  return SUPPORTED_SETTING_KEYS.has(key);
}

/** Contract bound for rawGpsRetentionDays (int 1..2147483647). */
export const RETENTION_DAYS_MINIMUM = 1;
export const RETENTION_DAYS_MAXIMUM = 2_147_483_647;

/**
 * Exact shape mirror of the shared paymentMoneySchema: unsigned decimal with
 * up to three fraction digits. Currency minor-unit representability is NOT
 * guessed client-side; the server validates it against the location currency.
 */
export const MONEY_INPUT_PATTERN =
  /^(?:0|[1-9]\d{0,10})(?:\.\d{1,3})?$/;

const HANDOFF_POLICY_VALUES: ReadonlySet<string> = new Set([
  "PICKUP_CODE",
  "DYNAMIC_QR",
  "EITHER",
]);
const PAYER_VALUES: ReadonlySet<string> = new Set(["CUSTOMER", "VENUE"]);
const METHODS_POLICY_VALUES: ReadonlySet<string> = new Set([
  "CASH_ONLY",
  "DIGITAL_ONLY",
  "CASH_OR_DIGITAL",
]);

export type ConfigurationEditorValue = boolean | number | string;

export type SettingParseOutcome =
  | { readonly ok: true; readonly value: ConfigurationEditorValue }
  | { readonly ok: false; readonly reasonKey: TranslationKey };

/**
 * Validates ONE edited setting value against its contract type. Money keeps
 * the exact entered text (trimmed) — never converted through Number().
 */
export function parseSettingInput(
  setting: ConfigurationSettingKey,
  input: ConfigurationEditorValue,
): SettingParseOutcome {
  switch (setting) {
    case "checkInPhotosRequired":
    case "trackingEnabled":
    case "tipsEnabled":
    case "validationEnabled":
    case "releaseRequiresPayment":
      return typeof input === "boolean"
        ? { ok: true, value: input }
        : invalid("config.validation.booleanInvalid");
    case "handoffStandardMethodPolicy":
      return typeof input === "string" && HANDOFF_POLICY_VALUES.has(input)
        ? { ok: true, value: input }
        : invalid("config.validation.optionInvalid");
    case "paymentServicePayer":
      return typeof input === "string" && PAYER_VALUES.has(input)
        ? { ok: true, value: input }
        : invalid("config.validation.optionInvalid");
    case "paymentMethodsPolicy":
      return typeof input === "string" && METHODS_POLICY_VALUES.has(input)
        ? { ok: true, value: input }
        : invalid("config.validation.optionInvalid");
    case "rawGpsRetentionDays":
      return parseRetentionInput(input);
    case "valetServiceFee":
      return typeof input === "string" &&
        MONEY_INPUT_PATTERN.test(input.trim())
        ? { ok: true, value: input.trim() }
        : invalid("config.validation.feeInvalid");
  }
}

function parseRetentionInput(input: ConfigurationEditorValue): SettingParseOutcome {
  if (typeof input !== "string" || !/^\d+$/.test(input.trim())) {
    return invalid("config.validation.retentionInvalid");
  }
  const parsed = Number(input.trim());
  if (
    !Number.isSafeInteger(parsed) ||
    parsed < RETENTION_DAYS_MINIMUM ||
    parsed > RETENTION_DAYS_MAXIMUM
  ) {
    return invalid("config.validation.retentionInvalid");
  }
  return { ok: true, value: parsed };
}

function invalid(reasonKey: TranslationKey): SettingParseOutcome {
  return { ok: false, reasonKey };
}

const valueKindError =
  "Edited configuration value does not match the setting's contract type.";

/** Contract-derived value unions for the three enum policy settings. */
type EnumRequestOf<K extends ConfigurationSettingKey> = Extract<
  SetConfigurationOverrideRequest,
  { setting: K }
>;
type HandoffValue = EnumRequestOf<"handoffStandardMethodPolicy">["value"];
type PayerValue = EnumRequestOf<"paymentServicePayer">["value"];
type MethodsValue = EnumRequestOf<"paymentMethodsPolicy">["value"];

/**
 * Builds the EXACT accepted set-override payload for one setting:
 * `{ setting, value, expectedUpdatedAt }`. Nothing else is ever included.
 */
export function buildSetOverrideRequest(
  setting: ConfigurationSettingKey,
  value: ConfigurationEditorValue,
  expectedUpdatedAt: string,
): SetConfigurationOverrideRequest {
  function requireBoolean(): boolean {
    if (typeof value !== "boolean") throw new TypeError(valueKindError);
    return value;
  }
  function requireString(): string {
    if (typeof value !== "string") throw new TypeError(valueKindError);
    return value;
  }
  switch (setting) {
    case "checkInPhotosRequired":
      return {
        expectedUpdatedAt,
        setting: "checkInPhotosRequired",
        value: requireBoolean(),
      };
    case "handoffStandardMethodPolicy":
      return {
        expectedUpdatedAt,
        setting: "handoffStandardMethodPolicy",
        value: requireString() as HandoffValue,
      };
    case "trackingEnabled":
      return {
        expectedUpdatedAt,
        setting: "trackingEnabled",
        value: requireBoolean(),
      };
    case "rawGpsRetentionDays":
      if (typeof value !== "number") throw new TypeError(valueKindError);
      return { expectedUpdatedAt, setting: "rawGpsRetentionDays", value };
    case "valetServiceFee":
      return {
        expectedUpdatedAt,
        setting: "valetServiceFee",
        value: requireString(),
      };
    case "paymentServicePayer":
      return {
        expectedUpdatedAt,
        setting: "paymentServicePayer",
        value: requireString() as PayerValue,
      };
    case "paymentMethodsPolicy":
      return {
        expectedUpdatedAt,
        setting: "paymentMethodsPolicy",
        value: requireString() as MethodsValue,
      };
    case "tipsEnabled":
      return {
        expectedUpdatedAt,
        setting: "tipsEnabled",
        value: requireBoolean(),
      };
    case "validationEnabled":
      return {
        expectedUpdatedAt,
        setting: "validationEnabled",
        value: requireBoolean(),
      };
    case "releaseRequiresPayment":
      return {
        expectedUpdatedAt,
        setting: "releaseRequiresPayment",
        value: requireBoolean(),
      };
  }
}

/**
 * Builds the EXACT accepted clear payload `{ setting, expectedUpdatedAt }`.
 * Clearing NEVER sends a null/sentinel value — only the explicit operation.
 */
export function buildClearOverrideRequest(
  setting: ConfigurationSettingKey,
  expectedUpdatedAt: string,
): ClearConfigurationOverrideRequest {
  return { setting, expectedUpdatedAt };
}

export function findConfigurationSetting(
  data: LocationConfigurationResponse,
  setting: ConfigurationSettingKey,
): ConfigurationSettingProjection | undefined {
  return data.settings.find((entry) => entry.setting === setting);
}

/**
 * Applies a SUCCESSFUL mutation response: the mutated setting's projection is
 * replaced by the authoritative backend result and the stored concurrency
 * token advances to the response token. All other projections stay untouched
 * (a mutation affects exactly one setting).
 */
export function applyMutationResponse(
  current: LocationConfigurationResponse,
  response: ConfigurationMutationResponse,
): LocationConfigurationResponse {
  return {
    ...current,
    updatedAt: response.updatedAt,
    settings: current.settings.map((entry) =>
      entry.setting === response.result.setting ? response.result : entry,
    ),
  };
}

/** True only for the real backend optimistic-concurrency rejection. */
export function isConfigurationConflictError(error: unknown): boolean {
  return (
    error instanceof DashboardApiError &&
    error.code === "CONFIGURATION_OVERRIDE_CONFLICT"
  );
}

/**
 * Truthful failure mapping. Raw SQL/error internals are never rendered;
 * every failure resolves to a typed, user-safe message key.
 */
export function configurationFailureMessageKey(
  error: unknown,
): TranslationKey {
  if (!(error instanceof DashboardApiError)) return "errors.requestFailed";
  if (error.isNetworkError) return "states.networkError";
  switch (error.kind) {
    case "session-expired":
      return "errors.sessionExpired";
    case "forbidden":
    case "authorization-masked":
      return "errors.accessDenied";
    case "rate-limited":
      return "errors.rateLimited";
    case "validation":
      return error.code === "CONFIGURATION_VALUE_INVALID" ||
          error.code === "CONFIGURATION_REQUEST_INVALID"
        ? "config.errors.valueInvalid"
        : "errors.requestFailed";
    default:
      return "errors.requestFailed";
  }
}

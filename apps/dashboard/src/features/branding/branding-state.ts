import type {
  BrandingClearRequest,
  BrandingReadResponse,
  BrandingSetting,
  BrandingSetRequest,
} from "@valet/contracts";

import type { TranslationKey } from "../../i18n/translations/types";
import { DashboardApiError } from "../../lib/api/api-error";

/**
 * Pure Branding state rules (D4-004).
 *
 * The optimistic-concurrency contract lives here so it is directly testable:
 * - the envelope's `updatedAt` is the ONLY concurrency token (one shared
 *   per-location token for BOTH settings — editing either rotates it);
 * - every mutation captures the CURRENT token verbatim into
 *   `expectedUpdatedAt` (never null, never refreshed silently);
 * - a successful mutation response IS the full authoritative read envelope;
 *   it replaces the visible state verbatim and advances the stored token to
 *   the response token. Nothing here ever recomputes `effective` — the
 *   backend-provided value is consumed directly.
 *
 * Display-name validation mirrors the shared contract EXACTLY: trim,
 * non-empty, at most 120 Unicode CODE POINTS (Array.from, never .length),
 * and no control characters (`/\p{Cc}/u`). The primary color accepts only
 * `#RRGGBB`; lowercase six-digit input is deliberately normalized to
 * UPPERCASE before contract validation (test-pinned) because the backend
 * accepts uppercase only.
 */

/** Exactly the two supported branding settings, in display order. */
export const BRANDING_SETTING_ORDER = [
  "brandDisplayName",
  "brandPrimaryColor",
] as const satisfies readonly BrandingSetting[];

const SUPPORTED_SETTING_KEYS: ReadonlySet<string> = new Set(
  BRANDING_SETTING_ORDER,
);

/** True only for the two contract settings; anything else fails. */
export function isSupportedBrandingSetting(key: string): boolean {
  return SUPPORTED_SETTING_KEYS.has(key);
}

/** Contract bound for brandDisplayName: max 120 Unicode code points. */
export const DISPLAY_NAME_MAX_CODE_POINTS = 120;

/** Exact contract pattern for an already-canonical primary color value. */
export const COLOR_INPUT_PATTERN = /^#[0-9A-F]{6}$/;

/**
 * Lowercase variant accepted by the editor as a deliberate convenience:
 * normalized to uppercase BEFORE contract validation, never sent as-is.
 */
const LOWERCASE_COLOR_PATTERN = /^#[0-9a-f]{6}$/;

export type BrandingParseOutcome =
  | { readonly ok: true; readonly value: string }
  | { readonly ok: false; readonly reasonKey: TranslationKey };

/**
 * Validates ONE edited branding value against its contract type. The display
 * name is returned TRIMMED (the contract trims too — the trimmed value is
 * what reaches the wire); the color is returned uppercased.
 */
export function parseBrandingInput(
  setting: BrandingSetting,
  input: string,
): BrandingParseOutcome {
  return setting === "brandDisplayName"
    ? parseDisplayNameInput(input)
    : parseColorInput(input);
}

function parseDisplayNameInput(input: string): BrandingParseOutcome {
  const trimmed = input.trim();
  if (trimmed.length < 1) {
    return invalid("branding.validation.nameInvalid");
  }
  if (Array.from(trimmed).length > DISPLAY_NAME_MAX_CODE_POINTS) {
    return invalid("branding.validation.nameInvalid");
  }
  if (/\p{Cc}/u.test(trimmed)) {
    return invalid("branding.validation.nameInvalid");
  }
  return { ok: true, value: trimmed };
}

function parseColorInput(input: string): BrandingParseOutcome {
  const trimmed = input.trim();
  if (COLOR_INPUT_PATTERN.test(trimmed)) {
    return { ok: true, value: trimmed };
  }
  // Deliberate, test-pinned normalization: a lowercase six-digit hex becomes
  // uppercase here so the exact contract value is what gets validated and
  // sent. Every other shape (3-digit, 8-digit, rgb(), named colors, no #)
  // stays invalid.
  if (LOWERCASE_COLOR_PATTERN.test(trimmed)) {
    return { ok: true, value: trimmed.toUpperCase() };
  }
  return invalid("branding.validation.colorInvalid");
}

function invalid(reasonKey: TranslationKey): BrandingParseOutcome {
  return { ok: false, reasonKey };
}

/**
 * Builds the EXACT accepted set-override payload for one setting:
 * `{ setting, value, expectedUpdatedAt }`. Nothing else is ever included.
 */
export function buildSetBrandingRequest(
  setting: BrandingSetting,
  value: string,
  expectedUpdatedAt: string,
): BrandingSetRequest {
  if (setting === "brandDisplayName") {
    return { expectedUpdatedAt, setting: "brandDisplayName", value };
  }
  return { expectedUpdatedAt, setting: "brandPrimaryColor", value };
}

/**
 * Builds the EXACT accepted clear payload `{ setting, expectedUpdatedAt }`.
 * Clearing NEVER sends a null/sentinel value — only the explicit operation.
 */
export function buildClearBrandingRequest(
  setting: BrandingSetting,
  expectedUpdatedAt: string,
): BrandingClearRequest {
  return { setting, expectedUpdatedAt };
}

/** One setting's backend-provided projection inside the read envelope. */
export type BrandingProjection = BrandingReadResponse["displayName"];

/**
 * Finds one setting's backend-provided projection inside the read envelope.
 */
export function findBrandingProjection(
  data: BrandingReadResponse,
  setting: BrandingSetting,
): BrandingProjection {
  return setting === "brandDisplayName" ? data.displayName : data.primaryColor;
}

/** True only for the real backend optimistic-concurrency rejection. */
export function isBrandingConflictError(error: unknown): boolean {
  return (
    error instanceof DashboardApiError &&
    error.code === "CONFIGURATION_OVERRIDE_CONFLICT"
  );
}

/**
 * Truthful failure mapping. Raw SQL/error internals are never rendered;
 * every failure resolves to a typed, user-safe message key.
 */
export function brandingFailureMessageKey(error: unknown): TranslationKey {
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
          error.code === "REQUEST_INVALID" ||
          error.code === "BRANDING_REQUEST_INVALID"
        ? "branding.errors.valueInvalid"
        : "errors.requestFailed";
    default:
      return "errors.requestFailed";
  }
}

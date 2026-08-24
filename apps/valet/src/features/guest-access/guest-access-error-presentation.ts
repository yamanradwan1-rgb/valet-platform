import type { EmployeeDictionary } from "../../lib/i18n/dictionary";
import type { GuestAccessErrorCode } from "./guest-access-types";

/**
 * Maps locale-neutral controller error codes to bilingual dictionary copy.
 * This is the only place Guest Access errors become user-visible text, so
 * no raw backend or English-only message can leak into the Arabic UI.
 */
export function presentGuestAccessError(
  code: GuestAccessErrorCode,
  t: EmployeeDictionary,
): string {
  switch (code) {
    case "CONFIG_INVALID":
      return t.guestAccessConfigError;
    case "GENERATED_CREDENTIAL_INVALID":
      return t.guestAccessErrorInvalidCredential;
    case "INTENT_CONFLICT":
      return t.guestAccessErrorIntentConflict;
    case "LOAD_FAILED":
      return t.guestAccessErrorLoadFailed;
    case "OFFLINE":
      return t.guestAccessErrorOffline;
    case "OUTCOME_UNKNOWN":
      return t.guestAccessErrorOutcomeUnknown;
    case "REVOKE_FAILED":
      return t.guestAccessErrorRevokeFailed;
    case "UPDATE_FAILED":
      return t.guestAccessErrorUpdateFailed;
  }
}

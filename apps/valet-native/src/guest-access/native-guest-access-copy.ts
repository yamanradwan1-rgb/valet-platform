import type { FoundationLocale } from "../foundation/foundation-locale";
import type { NativeGuestAccessError } from "./native-guest-access-types";
import { getNativeEmployeeDictionary } from "../i18n/native-employee-dictionary";

export function getNativeGuestAccessCopy(locale: FoundationLocale) {
  const d = getNativeEmployeeDictionary(locale);
  return {
    active: d.guestAccessActive,
    activeNoLink: d.guestAccessActiveNoLink,
    back: d.back,
    cancel: d.cancelLabel,
    copied: d.guestAccessCopied,
    copyFailed: d.guestAccessCopyFailed,
    copyLink: d.guestAccessCopyLink,
    create: d.guestAccessCreate,
    creating: d.guestAccessCreating,
    createNew: d.guestAccessCreateNew,
    errors: {
      CONFIG_INVALID: d.guestAccessConfigError,
      GENERATED_CREDENTIAL_INVALID: d.guestAccessErrorInvalidCredential,
      INTENT_CONFLICT: d.guestAccessErrorIntentConflict,
      LOAD_FAILED: d.guestAccessErrorLoadFailed,
      OFFLINE: d.guestAccessErrorOffline,
      OUTCOME_UNKNOWN: d.guestAccessErrorOutcomeUnknown,
      REVOKE_FAILED: d.guestAccessErrorRevokeFailed,
      UPDATE_FAILED: d.guestAccessErrorUpdateFailed,
    } satisfies Record<NativeGuestAccessError, string>,
    entryHint: d.guestAccessEntryHint,
    expired: d.guestAccessExpired,
    expires: d.guestAccessExpires,
    loading: d.loadingSession,
    noNetwork: d.noNetworkMessage,
    notCreated: d.guestAccessNotCreated,
    qrAlt: d.guestAccessQrAlt,
    ready: d.guestAccessReady,
    reissue: d.guestAccessReissue,
    reissueBody: d.guestAccessReissueConfirmBody,
    reissueTitle: d.guestAccessReissueConfirmTitle,
    retry: d.retry,
    revoke: d.guestAccessRevoke,
    revokeBody: d.guestAccessRevokeConfirmBody,
    revoked: d.guestAccessRevoked,
    revokedHint: d.guestAccessRevokedHint,
    revokeTitle: d.guestAccessRevokeConfirmTitle,
    shareHint: d.guestAccessShareHint,
    title: d.guestAccessTitle,
  };
}

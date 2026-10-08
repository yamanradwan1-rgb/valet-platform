// Guest-safe API error copy is a separate translation responsibility.
// Preserve exact keys across English and Arabic; do not expose backend text.
export interface GuestErrorTranslationTypes {
  'errors.ANTI_ABUSE_UNAVAILABLE': string;
  'errors.GUEST_ACCESS_INVALID': string;
  'errors.GUEST_ACCESS_RATE_LIMITED': string;
  'errors.HANDOFF_VERIFICATION_FAILED': string;
  'errors.HANDOFF_VERIFICATION_RATE_LIMITED': string;
  'errors.HANDOFF_VERIFICATION_NOT_ACTIVE': string;
  'errors.HANDOFF_VERIFICATION_ALREADY_ISSUED': string;
  'errors.HANDOFF_VERIFICATION_ALREADY_VERIFIED': string;
  'errors.MUTATION_OUTCOME_UNKNOWN': string;
  'errors.REQUEST_TIMEOUT': string;
  'errors.INVALID_RESPONSE': string;
  'errors.GUEST_REQUEST_CANCELLED': string;
  'errors.INVALID_STATE_TRANSITION': string;
  'errors.RETRIEVAL_REQUEST_NOT_READY': string;
  'errors.VERSION_CONFLICT': string;
  'errors.SERVICE_UNAVAILABLE': string;
  'errors.REQUEST_FAILED': string;
  'errors.NETWORK_ERROR': string;
  'errors.GENERIC_ERROR': string;
}

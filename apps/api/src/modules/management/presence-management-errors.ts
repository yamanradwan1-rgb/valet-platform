export type PresenceManagementErrorCode =
  | "PRESENCE_CONFIGURATION_CONFLICT"
  | "PRESENCE_INHERITED_CONTEXT_CONFLICT"
  | "PRESENCE_NOT_READY"
  | "PRESENCE_STRICT_ROLLOUT_CLOSED"
  | "PRESENCE_MUTATION_CONFLICT"
  | "PRESENCE_REVIEW_CONFLICT";

export class PresenceManagementError extends Error {
  constructor(readonly code: PresenceManagementErrorCode) {
    super(code);
    this.name = "PresenceManagementError";
  }
}

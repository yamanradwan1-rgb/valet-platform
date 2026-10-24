import { ApiTransportValidationError } from "../../common/http/api-errors";

/** Explicit acknowledgment requests an UNVERIFIED, DISABLED test binding only. */
export function validateSandboxBindingRequest(value: unknown): void {
  if (value === null || typeof value !== "object" || Array.isArray(value) ||
      Object.keys(value).length !== 1 ||
      (value as Record<string, unknown>).requestPendingSandboxBinding !== true) {
    throw new ApiTransportValidationError();
  }
}

/** Preserve a production-safe default and one explicitly owned test scope. */
export function sandboxBindingRequestAllowed(
  env: NodeJS.ProcessEnv, organizationId: string, databaseName: string,
): boolean {
  return env.NODE_ENV === "test" &&
    env.OUTBOUND_MESSAGING_MODE === "test" &&
    env.OUTBOUND_META_SANDBOX_ACTIVATION_ENABLED === "false" &&
    env.OUTBOUND_MESSAGING_SEND_ENABLED === "false" &&
    env.GUEST_ACCESS_AUTO_ISSUE_ENABLED === "false" &&
    env.OUTBOUND_META_TEST_DATABASE_NAME === "vaylet_wa310" &&
    env.OUTBOUND_META_TEST_ORGANIZATION_ID === organizationId &&
    databaseName === "vaylet_wa310";
}

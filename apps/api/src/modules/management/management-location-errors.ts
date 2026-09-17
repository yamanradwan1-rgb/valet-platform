export type ManagementLocationErrorCode =
  | "AUTHORIZATION_DENIED"
  | "CONFIGURATION_VALUE_INVALID"
  | "IDEMPOTENCY_CONFLICT"
  | "LOCATION_CODE_CONFLICT"
  | "LOCATION_DRAIN_BLOCKED"
  | "LOCATION_INVALID_STATE"
  | "LOCATION_LIFECYCLE_CONFLICT"
  | "LOCATION_NOT_READY";

export class ManagementLocationError extends Error {
  constructor(readonly code: ManagementLocationErrorCode) {
    super(
      code === "AUTHORIZATION_DENIED"
        ? "The requested resource is not available."
        : code === "LOCATION_DRAIN_BLOCKED"
          ? "The Location still has active operational work."
          : code === "LOCATION_NOT_READY"
            ? "The Location is not ready for activation."
            : "The Location lifecycle operation could not be applied.",
    );
    this.name = "ManagementLocationError";
  }
}

interface PostgresError {
  readonly code?: unknown;
}

export function mapManagementLocationDatabaseError(error: unknown): never {
  const code = String((error as PostgresError).code ?? "");
  if (code === "42501")
    throw new ManagementLocationError("AUTHORIZATION_DENIED");
  if (["22023", "22P02", "22003", "22007"].includes(code)) {
    throw new ManagementLocationError("CONFIGURATION_VALUE_INVALID");
  }
  throw error;
}

export type PhysicalResourceErrorCode =
  | "AUTHORIZATION_DENIED"
  | "CONFIGURATION_VALUE_INVALID"
  | "IDEMPOTENCY_CONFLICT"
  | "PARKING_ZONE_INVALID"
  | "RESOURCE_CODE_CONFLICT";

export class PhysicalResourceError extends Error {
  constructor(readonly code: PhysicalResourceErrorCode) {
    super(
      code === "AUTHORIZATION_DENIED"
        ? "The requested resource is not available."
        : code === "RESOURCE_CODE_CONFLICT"
          ? "A resource with this code already exists in this Location."
          : code === "PARKING_ZONE_INVALID"
            ? "The selected Parking Zone is not available."
            : code === "IDEMPOTENCY_CONFLICT"
              ? "This operation id was already used for different input."
              : "The physical resource input is invalid.",
    );
    this.name = "PhysicalResourceError";
  }
}

interface PgError {
  readonly code?: unknown;
}

export function mapPhysicalResourceDatabaseError(error: unknown): never {
  const code = String((error as PgError).code ?? "");
  if (code === "42501") throw new PhysicalResourceError("AUTHORIZATION_DENIED");
  if (["22023", "22P02", "22003", "22007"].includes(code)) {
    throw new PhysicalResourceError("CONFIGURATION_VALUE_INVALID");
  }
  throw error;
}

interface PgError {
  readonly code?: string;
}

export class DashboardConfigurationError extends Error {
  constructor(
    readonly code:
      | "AUTHORIZATION_DENIED"
      | "CONFIGURATION_OVERRIDE_CONFLICT"
      | "CONFIGURATION_VALUE_INVALID",
  ) {
    super(
      code === "AUTHORIZATION_DENIED"
        ? "The requested resource is not available."
        : code === "CONFIGURATION_OVERRIDE_CONFLICT"
          ? "Location configuration changed concurrently."
          : "Invalid location configuration value.",
    );
    this.name = "DashboardConfigurationError";
  }
}

export function mapDashboardConfigurationDatabaseError(
  error: unknown,
): never {
  const code = (error as PgError).code;
  if (code === "42501") {
    throw new DashboardConfigurationError("AUTHORIZATION_DENIED");
  }
  if (code === "40001") {
    throw new DashboardConfigurationError("CONFIGURATION_OVERRIDE_CONFLICT");
  }
  if (
    code === "22023" ||
    code === "22P02" ||
    code === "22003" ||
    code === "22007"
  ) {
    throw new DashboardConfigurationError("CONFIGURATION_VALUE_INVALID");
  }
  throw error;
}

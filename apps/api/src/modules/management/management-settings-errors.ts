interface PostgresError {
  readonly code?: unknown;
}

export class ManagementSettingsError extends Error {
  constructor(
    readonly code:
      | "AUTHORIZATION_DENIED"
      | "CONFIGURATION_CONFLICT"
      | "CONFIGURATION_VALUE_INVALID",
  ) {
    super(
      code === "AUTHORIZATION_DENIED"
        ? "The requested resource is not available."
        : code === "CONFIGURATION_CONFLICT"
          ? "Management configuration changed concurrently."
          : "Invalid Management configuration value.",
    );
    this.name = "ManagementSettingsError";
  }
}

export function mapManagementSettingsDatabaseError(error: unknown): never {
  const code = (error as PostgresError).code;
  if (code === "42501") {
    throw new ManagementSettingsError("AUTHORIZATION_DENIED");
  }
  if (code === "40001") {
    throw new ManagementSettingsError("CONFIGURATION_CONFLICT");
  }
  if (["22023", "22P02", "22003", "22007"].includes(String(code))) {
    throw new ManagementSettingsError("CONFIGURATION_VALUE_INVALID");
  }
  throw error;
}

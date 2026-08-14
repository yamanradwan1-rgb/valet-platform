interface PgError {
  readonly code?: string;
}

export class MapSetupError extends Error {
  constructor(readonly code: "AUTHORIZATION_DENIED" | "MAP_SETUP_CONFLICT") {
    super(
      code === "MAP_SETUP_CONFLICT"
        ? "Map setup configuration conflicts with an existing resource."
        : "The requested resource is not available.",
    );
    this.name = "MapSetupError";
  }
}

export function mapSetupDatabaseError(error: unknown): never {
  const code = (error as PgError).code;
  if (code === "42501") throw new MapSetupError("AUTHORIZATION_DENIED");
  if (code === "23505" || code === "40001") {
    throw new MapSetupError("MAP_SETUP_CONFLICT");
  }
  throw error;
}

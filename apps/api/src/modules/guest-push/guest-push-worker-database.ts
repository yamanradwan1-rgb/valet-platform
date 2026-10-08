function requiredPostgresPrincipal(
  env: NodeJS.ProcessEnv,
  name: "DATABASE_URL" | "GUEST_PUSH_WORKER_DATABASE_URL",
): { readonly principal: string; readonly url: string } {
  const value = env[name];
  if (value === undefined || value.trim() === "") {
    throw new Error(`Guest Push worker requires ${name}.`);
  }
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`Guest Push worker requires a valid PostgreSQL ${name}.`);
  }
  if (
    (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") ||
    parsed.username === ""
  ) {
    throw new Error(`Guest Push worker requires a valid PostgreSQL ${name}.`);
  }
  let principal: string;
  try {
    principal = decodeURIComponent(parsed.username);
  } catch {
    throw new Error(`Guest Push worker requires a valid PostgreSQL ${name}.`);
  }
  if (principal === "") {
    throw new Error(`Guest Push worker requires a valid PostgreSQL ${name}.`);
  }
  return { principal, url: value };
}

export function readGuestPushWorkerDatabaseUrl(
  env: NodeJS.ProcessEnv,
): string {
  const api = requiredPostgresPrincipal(env, "DATABASE_URL");
  const worker = requiredPostgresPrincipal(
    env,
    "GUEST_PUSH_WORKER_DATABASE_URL",
  );
  if (api.principal === worker.principal) {
    throw new Error(
      "Guest Push worker database principal must be distinct from the ordinary API principal.",
    );
  }
  return worker.url;
}

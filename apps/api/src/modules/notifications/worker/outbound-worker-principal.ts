function principalFromUrl(name: string, url: string | undefined): string {
  if (url === undefined || url.trim() === "") {
    throw new Error(`OUTBOUND_WORKER_${name}_MISSING`);
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`OUTBOUND_WORKER_${name}_INVALID`);
  }
  if (
    !["postgres:", "postgresql:"].includes(parsed.protocol) ||
    parsed.username === "" || parsed.password === "" ||
    parsed.pathname.length <= 1 || parsed.search !== "" || parsed.hash !== ""
  ) {
    throw new Error(`OUTBOUND_WORKER_${name}_INVALID`);
  }
  let principal: string;
  try {
    principal = decodeURIComponent(parsed.username);
  } catch {
    throw new Error(`OUTBOUND_WORKER_${name}_INVALID`);
  }
  if (principal === "") throw new Error(`OUTBOUND_WORKER_${name}_INVALID`);
  return principal;
}

/** Sender must not inherit API, webhook, migration or maintenance credentials. */
export function senderDatabaseUrl(environment: NodeJS.ProcessEnv): string {
  const name = "OUTBOUND_MESSAGING_WORKER_DATABASE_URL";
  const url = environment[name];
  const principal = principalFromUrl(name, url);
  for (const forbidden of [
    "DATABASE_URL", "MIGRATION_DATABASE_URL", "OUTBOUND_MESSAGING_WEBHOOK_DATABASE_URL",
    "OUTBOUND_MAINTENANCE_DATABASE_URL",
  ]) {
    const other = environment[forbidden];
    if (other !== undefined && principal === principalFromUrl(forbidden, other)) {
      throw new Error("OUTBOUND_SENDER_ROLE_NOT_DISTINCT");
    }
  }
  return url!;
}

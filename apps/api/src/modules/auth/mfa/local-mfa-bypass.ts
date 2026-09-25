export interface LocalMfaBypassPolicy {
  readonly enabled: boolean;
}

const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);
const unsafeConfigurationMessage =
  "VAYLET_LOCAL_DISABLE_MFA may only be enabled for local development.";
let configuredProcessPolicy: LocalMfaBypassPolicy | undefined;

function unsafeConfiguration(): never {
  throw new Error(unsafeConfigurationMessage);
}

function normalizedHostname(hostname: string): string {
  const lower = hostname.toLowerCase();
  return lower.startsWith("[") && lower.endsWith("]")
    ? lower.slice(1, -1)
    : lower;
}

export function readLocalMfaBypassPolicy(
  environment: NodeJS.ProcessEnv,
): LocalMfaBypassPolicy {
  const raw = environment.VAYLET_LOCAL_DISABLE_MFA;
  if (raw === undefined || raw === "" || raw === "false") {
    return { enabled: false };
  }
  if (raw !== "true") {
    throw new Error(
      'VAYLET_LOCAL_DISABLE_MFA must be exactly "true" or "false".',
    );
  }
  if (environment.NODE_ENV !== "development") unsafeConfiguration();

  const databaseUrl = environment.DATABASE_URL;
  if (databaseUrl === undefined || databaseUrl.trim() === "") {
    unsafeConfiguration();
  }
  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    unsafeConfiguration();
  }
  if (
    !["postgres:", "postgresql:"].includes(parsed.protocol) ||
    !localHosts.has(normalizedHostname(parsed.hostname))
  ) {
    unsafeConfiguration();
  }
  return { enabled: true };
}

export function configureLocalMfaBypassPolicy(
  environment: NodeJS.ProcessEnv,
): LocalMfaBypassPolicy {
  const policy = readLocalMfaBypassPolicy(environment);
  configuredProcessPolicy = policy;
  return policy;
}

export function localMfaBypassEnabled(
  environment: NodeJS.ProcessEnv = process.env,
): boolean {
  return (
    configuredProcessPolicy ?? readLocalMfaBypassPolicy(environment)
  ).enabled;
}

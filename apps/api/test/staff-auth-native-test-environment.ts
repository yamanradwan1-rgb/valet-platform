import { randomBytes, randomUUID } from "node:crypto";

type RunPnpm = (
  args: string[],
  environment: NodeJS.ProcessEnv,
) => Promise<void>;

export function createFixtureStaffAuthWriterIdentity(applicationUrl: string) {
  const suffix = `${process.pid}_${randomBytes(4).toString("hex")}`;
  const role = `vaylet_staff_auth_writer_${suffix}`;
  const url = new URL(applicationUrl);
  url.username = role;
  url.password = `staff-writer-${randomUUID()}`;
  return { role, url: url.toString() };
}

export class StaffAuthNativeProofKeys {
  readonly antiAbuseHmac = randomBytes(32).toString("base64url");
  readonly sqlProof = randomBytes(32).toString("base64url");
  private readonly previous = {
    antiAbuseHmac: process.env.ANTI_ABUSE_HMAC_SECRET_B64URL,
    sqlProof: process.env.ANTI_ABUSE_SQL_PROOF_SECRET_B64URL,
  };

  environment(): NodeJS.ProcessEnv {
    return {
      ANTI_ABUSE_HMAC_SECRET_B64URL: this.antiAbuseHmac,
      ANTI_ABUSE_SQL_PROOF_SECRET_B64URL: this.sqlProof,
    };
  }

  async provision(
    runPnpm: RunPnpm,
    migrationUrl: string,
    applicationUrl: string,
  ): Promise<void> {
    await runPnpm(
      [
        "--filter",
        "@valet/database",
        "exec",
        "node",
        "scripts/provision-s04-proof-key.mjs",
      ],
      {
        ...this.environment(),
        DATABASE_URL: applicationUrl,
        MIGRATION_DATABASE_URL: migrationUrl,
        NODE_ENV: "test",
      },
    );
  }

  apply(): void {
    process.env.ANTI_ABUSE_HMAC_SECRET_B64URL = this.antiAbuseHmac;
    process.env.ANTI_ABUSE_SQL_PROOF_SECRET_B64URL = this.sqlProof;
  }

  restore(): void {
    const restore = (name: string, value: string | undefined) => {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    };
    restore("ANTI_ABUSE_HMAC_SECRET_B64URL", this.previous.antiAbuseHmac);
    restore("ANTI_ABUSE_SQL_PROOF_SECRET_B64URL", this.previous.sqlProof);
  }
}

export function resolveProtectedWriterEnvironment(
  explicit: Record<string, string>,
  fallbackMfaWriterUrl: string,
  requestedProtectedMode: string | undefined,
  activityRoot: string,
) {
  const protectedMode =
    requestedProtectedMode === "1" ||
    explicit.MFA_PROTECTED_WRITER_ENABLED === "true";
  const writers: Record<string, string> = {
    ...explicit,
    MFA_PROTECTED_WRITER_ENABLED: protectedMode ? "true" : "false",
    ...(protectedMode
      ? {
          MFA_WRITER_DATABASE_URL:
            explicit.MFA_WRITER_DATABASE_URL ?? fallbackMfaWriterUrl,
          MFA_ACTIVITY_PROOF_SECRET_B64URL: activityRoot,
        }
      : {}),
  };
  const staffWriterUrl = writers.STAFF_AUTH_WRITER_DATABASE_URL;
  if (!staffWriterUrl) {
    throw new Error(
      "Staff Auth native fixture requires a dedicated writer URL.",
    );
  }
  const staffAuthWriterRole = decodeURIComponent(
    new URL(staffWriterUrl).username,
  );
  if (
    !/^[a-z_][a-z0-9_]{0,62}$/.test(staffAuthWriterRole) ||
    (explicit.STAFF_AUTH_WRITER_ROLE !== undefined &&
      explicit.STAFF_AUTH_WRITER_ROLE !== staffAuthWriterRole)
  ) {
    throw new Error(
      "Staff Auth native fixture writer role does not match its URL.",
    );
  }
  writers.STAFF_AUTH_WRITER_ROLE = staffAuthWriterRole;
  const protectedMfaRole = protectedMode
    ? decodeURIComponent(new URL(writers.MFA_WRITER_DATABASE_URL!).username)
    : undefined;
  return { protectedMode, protectedMfaRole, writers };
}

export async function provisionStaffAuthWriter(
  runPnpm: RunPnpm,
  migrationUrl: string,
  applicationUrl: string,
  writers: Record<string, string>,
): Promise<void> {
  const writerUrl = writers.STAFF_AUTH_WRITER_DATABASE_URL;
  if (!writerUrl) {
    throw new Error("Staff Auth writer provisioning requires a dedicated URL.");
  }
  const role = decodeURIComponent(new URL(writerUrl).username);
  if (writers.STAFF_AUTH_WRITER_ROLE !== role) {
    throw new Error(
      "Staff Auth writer provisioning role does not match its URL.",
    );
  }
  await runPnpm(
    ["--filter", "@valet/database", "staff-auth-writer:provision"],
    {
      DATABASE_URL: applicationUrl,
      MIGRATION_DATABASE_URL: migrationUrl,
      STAFF_AUTH_WRITER_DATABASE_URL: writerUrl,
      STAFF_AUTH_WRITER_ROLE: role,
      NODE_ENV: "test",
    },
  );
}

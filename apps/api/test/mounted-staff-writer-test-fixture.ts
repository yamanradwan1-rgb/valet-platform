import { randomBytes, randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { createFixtureStaffAuthWriterIdentity, provisionStaffAuthWriter } from "./staff-auth-native-test-environment";

type RunPnpm = (args: string[], environment: NodeJS.ProcessEnv) => Promise<void>;

export async function provisionMountedStaffWriters(
  input: { admin: Pool; migrationUrl: string; runtimeUrl: string; roles: string[] },
  runPnpm: RunPnpm,
  protectedMfa: boolean,
) {
  const writer = createFixtureStaffAuthWriterIdentity(input.runtimeUrl);
  const mfa = new URL(input.runtimeUrl);
  mfa.username = `valet_fixture_mfa_${randomUUID().replaceAll("-", "")}`;
  mfa.password = randomBytes(32).toString("base64url");
  const roles = protectedMfa ? [writer.role, mfa.username] : [writer.role];
  const existing = await input.admin.query(
    "SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = ANY($1::text[])", [roles],
  );
  if (existing.rowCount !== 0) throw new Error("Fixture writer role already exists.");
  input.roles.push(...roles);
  const staffAuth = {
    STAFF_AUTH_WRITER_DATABASE_URL: writer.url,
    STAFF_AUTH_WRITER_ROLE: writer.role,
  };
  const mfaEnvironment: Record<string, string> = protectedMfa ? {
    MFA_PROTECTED_WRITER_ENABLED: "true",
    MFA_WRITER_DATABASE_URL: mfa.toString(),
    MFA_ACTIVITY_PROOF_SECRET_B64URL: randomBytes(32).toString("base64url"),
  } : {};
  if (protectedMfa) {
    await runPnpm(["--filter", "@valet/database", "runtime:provision"], {
      ...staffAuth, ...mfaEnvironment, NODE_ENV: "test",
      DATABASE_URL: input.runtimeUrl, MIGRATION_DATABASE_URL: input.migrationUrl,
    });
  }
  await provisionStaffAuthWriter(runPnpm, input.migrationUrl, input.runtimeUrl, staffAuth);
  return { ...writer, mfaEnvironment };
}

import { randomUUID } from "node:crypto";
import { Client } from "pg";

import { runPnpm } from "../staff-auth-native-run-pnpm";

const cutoverCommand = [
  "--filter",
  "@valet/database",
  "exec",
  "node",
  "scripts/provision-option-c-protected-cutover.mjs",
];

export async function rehearseProtectedCutover(
  migrationUrl: string,
  environment: Record<string, string>,
): Promise<void> {
  const writerUrl = environment.MFA_WRITER_DATABASE_URL;
  if (!writerUrl) throw new Error("Missing isolated MFA Writer fixture URL.");
  const incorrectMfa = new URL(writerUrl);
  incorrectMfa.password = randomUUID();
  let credentialRejected = false;
  try {
    await runPnpm(cutoverCommand, {
      ...environment,
      MFA_WRITER_DATABASE_URL: incorrectMfa.toString(),
    });
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !error.message.includes(
        "Option C cutover could not attest the configured vaylet_mfa_writer login.",
      )
    ) {
      throw error;
    }
    credentialRejected = true;
  }
  if (!credentialRejected)
    throw new Error("Cutover accepted an incorrect Writer password.");

  const database = new Client({ connectionString: migrationUrl });
  try {
    await database.connect();
    await database.query("SET ROLE vap1_proof_owner");
    const assertPhase = async (expected: "LEGACY" | "PROTECTED") => {
      const result = await database.query<{ phase: string }>(
        "SELECT phase FROM auth_proof_private.option_c_launch_boundary WHERE singleton",
      );
      if (result.rowCount !== 1 || result.rows[0]?.phase !== expected) {
        throw new Error(`Expected Option C cutover phase ${expected}.`);
      }
    };
    await assertPhase("LEGACY");
    await runPnpm(cutoverCommand, environment);
    await assertPhase("PROTECTED");
    await runPnpm(cutoverCommand, environment);
    await assertPhase("PROTECTED");
    console.info(
      "Option C rejected incorrect MFA credentials in LEGACY and verified PROTECTED twice.",
    );
  } finally {
    await database.end();
  }
}

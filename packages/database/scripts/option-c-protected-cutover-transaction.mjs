import {
  retireOptionCLegacyAcl,
  verifyOptionCProtectedAcl,
} from "./option-c-protected-cutover-acl.mjs";
import { verifyOptionCProtectedReadiness } from "./option-c-protected-cutover-readiness.mjs";
import { assertOptionCLegacyWorkersDrained } from "./option-c-protected-cutover-drain.mjs";
import {
  assertSameCutoverTransaction,
  lockOptionCBoundary,
  promoteOptionCBoundary,
} from "./option-c-protected-cutover-state.mjs";

export const optionCCutoverDependencies = Object.freeze({
  assertSameTransaction: assertSameCutoverTransaction,
  assertLegacyDrained: assertOptionCLegacyWorkersDrained,
  lockBoundary: lockOptionCBoundary,
  promoteBoundary: promoteOptionCBoundary,
  retireLegacyAcl: retireOptionCLegacyAcl,
  verifyFinalAcl: verifyOptionCProtectedAcl,
  verifyReadiness: verifyOptionCProtectedReadiness,
});

export async function runOptionCProtectedCutoverTransaction(
  client,
  { migrationRole, runtimeRole },
  executeFormatted,
  dependencies = optionCCutoverDependencies,
) {
  await client.query("BEGIN");
  let state;
  try {
    // This is deliberately the first privileged action in the transaction.
    // Legacy provisioning takes FOR SHARE on the same singleton, so this
    // owner-scoped FOR UPDATE serializes every pre-PROTECTED grant replay.
    state = await dependencies.lockBoundary(client, migrationRole);
    if (state.phase === "LEGACY") {
      await dependencies.assertLegacyDrained(client, runtimeRole);
    }
    await dependencies.verifyReadiness(client, runtimeRole, migrationRole, {
      phase: state.phase,
    });

    let promoted = false;
    if (state.phase === "LEGACY") {
      await dependencies.retireLegacyAcl(client, executeFormatted, runtimeRole);
      await dependencies.verifyFinalAcl(client, runtimeRole, migrationRole);
      await dependencies.assertSameTransaction(client, migrationRole, state);
      promoted = await dependencies.promoteBoundary(
        client,
        migrationRole,
        state,
      );
    } else {
      // PROTECTED is irreversible. Re-running this operator tool is verification
      // only; it never repairs ACLs or invokes any legacy/broad provisioner.
      await dependencies.verifyFinalAcl(client, runtimeRole, migrationRole);
      await dependencies.assertSameTransaction(client, migrationRole, state);
    }
    await dependencies.assertSameTransaction(client, migrationRole, state);
    await client.query("COMMIT");
    return { phaseBefore: state.phase, promoted };
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // Keep the security failure that caused the rollback attempt.
    }
    throw error;
  }
}

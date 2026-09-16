import { executeControlledMfaRecovery } from "./mfa-recovery/execution";
import { parseMfaRecoveryArguments } from "./mfa-recovery/input";
import { ControlledMfaRecoveryError } from "./mfa-recovery/types";

async function main(): Promise<void> {
  try {
    const input = parseMfaRecoveryArguments(process.argv.slice(2));
    const result = await executeControlledMfaRecovery(input, process.env);
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    process.stderr.write(
      `${error instanceof ControlledMfaRecoveryError ? error.message : "Controlled MFA recovery failed."}\n`,
    );
    process.exitCode = 1;
  }
}

if (process.argv[1]?.endsWith("recover-mfa.ts")) void main();

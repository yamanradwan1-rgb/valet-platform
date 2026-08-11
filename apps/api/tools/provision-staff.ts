import { parseProvisioningArguments } from "./staff-provisioning/provisioning-input";
import { executeProvisioning } from "./staff-provisioning/provisioning-execution";
import { readProvisioningPassword } from "./staff-provisioning/provisioning-password";
import { StaffProvisioningError } from "./staff-provisioning/types";

export {
  assertNonProductionLoopback,
  parseProvisioningArguments,
  requireNodeEnvironment,
} from "./staff-provisioning/provisioning-input";
export { executeProvisioning } from "./staff-provisioning/provisioning-execution";
export {
  hashProvisioningPassword,
  normalizeProvisioningIdentity,
  passwordFromStdin,
  readProvisioningPassword,
} from "./staff-provisioning/provisioning-password";
export { persistProvisionedStaff } from "./staff-provisioning/provisioning-persistence";
export {
  StaffProvisioningError,
  type ProvisioningArguments,
  type ProvisioningResult,
  type StaffProvisioningRole,
} from "./staff-provisioning/types";

async function readStandardInput(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function main(): Promise<void> {
  try {
    const input = parseProvisioningArguments(process.argv.slice(2));
    const password = await readProvisioningPassword(
      process.stdin.isTTY === true,
      readStandardInput,
    );
    const result = await executeProvisioning(input, password, process.env);
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    const message =
      error instanceof StaffProvisioningError
        ? error.message
        : "Staff provisioning failed.";
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1]?.endsWith("provision-staff.ts")) {
  void main();
}

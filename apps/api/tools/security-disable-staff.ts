import { executeControlledSecurityDisable } from "./security-disable/execution";
import { parseSecurityDisableArguments } from "./security-disable/input";
import { ControlledSecurityDisableError } from "./security-disable/types";

async function main(): Promise<void> {
  try {
    const input = parseSecurityDisableArguments(process.argv.slice(2));
    const result = await executeControlledSecurityDisable(input, process.env);
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    process.stderr.write(
      `${error instanceof ControlledSecurityDisableError ? error.message : "Controlled Staff security disable failed."}\n`,
    );
    process.exitCode = 1;
  }
}

if (process.argv[1]?.endsWith("security-disable-staff.ts")) void main();

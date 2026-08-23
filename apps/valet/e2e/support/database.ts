import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const repositoryRoot = path.resolve(import.meta.dirname, "../../../..");

export async function setE2eShiftState(
  state: "active" | "ended",
): Promise<void> {
  const executable = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  await execFileAsync(
    executable,
    [
      "--filter",
      "@valet/api",
      "exec",
      "tsx",
      "tools/e2e/set-employee-e2e-shift.ts",
      state,
    ],
    {
      cwd: repositoryRoot,
      env: {
        ...process.env,
        E2E_APPROVED_DATABASE:
          process.env.E2E_APPROVED_DATABASE ?? "valet",
        E2E_FIXTURE_CONFIRM: "employee-e2e",
        NODE_ENV: "test",
      },
    },
  );
}

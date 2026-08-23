import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const repositoryRoot = path.resolve(process.cwd(), "../..");

export async function setE2eShiftState(
  state: "active" | "ended",
): Promise<void> {
  const fixtureDatabaseUrl = process.env.MIGRATION_DATABASE_URL;
  if (!fixtureDatabaseUrl) {
    throw new Error("MIGRATION_DATABASE_URL is required for E2E fixture control.");
  }
  const tsxCli = path.join(
    repositoryRoot,
    "apps/api/node_modules/tsx/dist/cli.mjs",
  );
  await execFileAsync(
    process.execPath,
    [
      tsxCli,
      path.join(
        repositoryRoot,
        "apps/api/tools/e2e/set-employee-e2e-shift.ts",
      ),
      state,
    ],
    {
      cwd: repositoryRoot,
      env: {
        ...process.env,
        DATABASE_URL: fixtureDatabaseUrl,
        E2E_APPROVED_DATABASE:
          process.env.E2E_APPROVED_DATABASE ?? "valet",
        E2E_FIXTURE_CONFIRM: "employee-e2e",
        NODE_ENV: "test",
      },
    },
  );
}

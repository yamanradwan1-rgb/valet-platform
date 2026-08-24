import { existsSync } from "node:fs";
import { join } from "node:path";

import {
  loadBootstrapEnvironment,
  LOCAL_EMPLOYEE_ORIGIN,
  LOCAL_SERVICE_URLS,
} from "./local-dev-environment";
import { runPnpmCommand } from "./local-process-steps";
import {
  installInterruptHandler,
  startManagedProcess,
  stopAllProcesses,
  type ManagedChild,
} from "./local-app-processes";
import { renderBootstrapSummary, runBootstrap } from "./bootstrap";

const API_DIST_ENTRY = join("apps", "api", "dist", "main.js");

export function validateSmokeApiEnvironment(
  environment: NodeJS.ProcessEnv,
): void {
  const problems: string[] = [];
  const configuredOrigins = (environment.STAFF_AUTH_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim());
  if (!configuredOrigins.includes(LOCAL_EMPLOYEE_ORIGIN)) {
    problems.push(
      `Add ${LOCAL_EMPLOYEE_ORIGIN} to STAFF_AUTH_ALLOWED_ORIGINS in the repository .env so Employee sign-in works.`,
    );
  }
  if ((environment.ANTI_ABUSE_HMAC_SECRET_B64URL ?? "").trim() === "") {
    problems.push("Set ANTI_ABUSE_HMAC_SECRET_B64URL in the repository .env.");
  }
  if ((environment.HANDOFF_VERIFIER_HMAC_SECRET_B64URL ?? "").trim() === "") {
    problems.push(
      "Set HANDOFF_VERIFIER_HMAC_SECRET_B64URL in the repository .env.",
    );
  }
  if (problems.length > 0) {
    throw new Error(
      `Local smoke prerequisites are incomplete:\n- ${problems.join("\n- ")}`,
    );
  }
}

function buildWorkspaceArtifacts(repositoryRoot: string): void {
  runPnpmCommand(
    repositoryRoot,
    ["--filter", "@valet/contracts", "run", "build"],
    "Contracts build",
  );
  runPnpmCommand(
    repositoryRoot,
    ["--filter", "@valet/api", "run", "build"],
    "API build",
  );
}

export interface SmokeLaunchPlan {
  readonly apiEntryPath: string;
}

export function resolveApiEntryPath(repositoryRoot: string): string {
  const entryPath = join(repositoryRoot, API_DIST_ENTRY);
  if (!existsSync(entryPath)) {
    throw new Error(
      `Compiled API entry is missing at ${API_DIST_ENTRY}. Run the API build first.`,
    );
  }
  return entryPath;
}

async function main(): Promise<void> {
  let children: ManagedChild[] = [];
  installInterruptHandler(() => children);
  try {
    const { repositoryRoot } = loadBootstrapEnvironment();
    process.stdout.write("Bootstrapping deterministic local database...\n");
    const outcome = await runBootstrap();
    for (const line of renderBootstrapSummary(outcome)) {
      process.stdout.write(`${line}\n`);
    }

    validateSmokeApiEnvironment(process.env);
    buildWorkspaceArtifacts(repositoryRoot);
    const apiEntry = resolveApiEntryPath(repositoryRoot);

    process.stdout.write("\nStarting local services (Ctrl+C to stop)...\n");
    children = [
      startManagedProcess("api", process.execPath, [apiEntry], {
        cwd: repositoryRoot,
        env: { ...process.env, NODE_ENV: "development", PORT: "3001" },
      }),
      startManagedProcess(
        "employee",
        "pnpm",
        ["--filter", "@valet/valet", "run", "dev"],
        {
          cwd: repositoryRoot,
          env: { ...process.env, API_ORIGIN: LOCAL_SERVICE_URLS.api },
        },
      ),
      startManagedProcess(
        "customer",
        "pnpm",
        ["--filter", "@valet/customer", "run", "dev"],
        {
          cwd: repositoryRoot,
          env: { ...process.env, API_ORIGIN: LOCAL_SERVICE_URLS.api },
        },
      ),
    ];

    let stopping = false;
    const exits = children.map(
      (managed) =>
        new Promise<string | null>((resolve) => {
          const handleClose = (code: number | null): void => {
            if (code !== null && code !== 0 && !stopping) {
              stopping = true;
              process.stderr.write(
                `[smoke] ${managed.label} exited with code ${code}; stopping remaining services.\n`,
              );
              stopAllProcesses(children);
            }
            resolve(managed.label);
          };
          managed.child.on("close", handleClose);
          managed.child.on("error", () => handleClose(-1));
        }),
    );
    await Promise.all(exits);
    if (stopping) {
      throw new Error("A local service exited unexpectedly during smoke run.");
    }
  } catch (error) {
    stopAllProcesses(children);
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  }
}

if (process.argv[1]?.endsWith(join("local-dev", "smoke.ts"))) {
  void main();
}

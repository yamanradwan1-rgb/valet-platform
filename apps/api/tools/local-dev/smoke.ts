import { randomBytes } from "node:crypto";
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
const SMOKE_HMAC_SECRET_PATTERN = /^[A-Za-z0-9_-]{43}$/;

function generateSmokeHmacSecret(): string {
  return randomBytes(32).toString("base64url");
}

function resolveSmokeHmacSecret(
  value: string | undefined,
  variableName: string,
): string {
  const trimmed = (value ?? "").trim();
  if (trimmed === "") {
    return generateSmokeHmacSecret();
  }
  if (!SMOKE_HMAC_SECRET_PATTERN.test(trimmed)) {
    throw new Error(
      `${variableName} must be an unpadded base64url-encoded 32-byte secret.`,
    );
  }
  return trimmed;
}

export interface SmokeChildEnvironments {
  readonly apiEnv: NodeJS.ProcessEnv;
  readonly customerEnv: NodeJS.ProcessEnv;
  readonly employeeEnv: NodeJS.ProcessEnv;
}

export function resolveSmokeChildEnvironments(
  environment: NodeJS.ProcessEnv,
): SmokeChildEnvironments {
  const antiAbuseSecret = resolveSmokeHmacSecret(
    environment.ANTI_ABUSE_HMAC_SECRET_B64URL,
    "ANTI_ABUSE_HMAC_SECRET_B64URL",
  );
  const handoffSecret = resolveSmokeHmacSecret(
    environment.HANDOFF_VERIFIER_HMAC_SECRET_B64URL,
    "HANDOFF_VERIFIER_HMAC_SECRET_B64URL",
  );
  const sharedEnv: NodeJS.ProcessEnv = {
    ...environment,
    NODE_ENV: "development",
  };
  return {
    apiEnv: {
      ...sharedEnv,
      ANTI_ABUSE_HMAC_SECRET_B64URL: antiAbuseSecret,
      HANDOFF_VERIFIER_HMAC_SECRET_B64URL: handoffSecret,
      PORT: "3001",
      STAFF_AUTH_ALLOWED_ORIGINS: LOCAL_EMPLOYEE_ORIGIN,
    },
    customerEnv: {
      ...sharedEnv,
      API_ORIGIN: LOCAL_SERVICE_URLS.api,
    },
    employeeEnv: {
      ...sharedEnv,
      API_ORIGIN: LOCAL_SERVICE_URLS.api,
      NEXT_PUBLIC_CUSTOMER_APP_ORIGIN: LOCAL_SERVICE_URLS.customer,
    },
  };
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

    const childEnvironments = resolveSmokeChildEnvironments(process.env);
    buildWorkspaceArtifacts(repositoryRoot);
    const apiEntry = resolveApiEntryPath(repositoryRoot);

    process.stdout.write("\nStarting local services (Ctrl+C to stop)...\n");
    children = [
      startManagedProcess("api", process.execPath, [apiEntry], {
        cwd: repositoryRoot,
        env: childEnvironments.apiEnv,
      }),
      startManagedProcess(
        "employee",
        "pnpm",
        ["--filter", "@valet/valet", "run", "dev"],
        { cwd: repositoryRoot, env: childEnvironments.employeeEnv },
      ),
      startManagedProcess(
        "customer",
        "pnpm",
        ["--filter", "@valet/customer", "run", "dev"],
        { cwd: repositoryRoot, env: childEnvironments.customerEnv },
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

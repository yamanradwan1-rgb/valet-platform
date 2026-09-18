import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

import { testDatabaseUrl } from "./invocation-lease.mjs";
import { appendOwnershipEvent } from "./ownership-state.mjs";
import { linuxProcessIdentity } from "./process-identity.mjs";

const outputLimit = 512_000;

export async function runHarnessCommand(
  args,
  { cwd = process.cwd(), label = args.join(" ") } = {},
) {
  const command = pnpmCommand(args);
  const startedAt = Date.now();
  let output = "";
  const child = spawn(command.executable, command.args, {
    cwd,
    env: process.env,
    shell: command.shell,
    windowsHide: true,
    stdio: ["inherit", "pipe", "pipe"],
  });
  const runId = process.env.VAYLET_TEST_CLUSTER_RUN_ID;
  if (runId !== undefined && Number.isInteger(child.pid)) {
    appendOwnershipEvent({
      databaseUrl: testDatabaseUrl(),
      event: {
        type: "coordinator-child-started",
        pid: child.pid,
        processIdentity:
          process.platform === "linux"
            ? linuxProcessIdentity(child.pid)
            : undefined,
      },
      runId,
      workerId: `coordinator-${process.pid}`,
    });
  }
  child.stdout.on("data", (chunk) => {
    process.stdout.write(chunk);
    output = boundedAppend(output, chunk.toString());
  });
  child.stderr.on("data", (chunk) => {
    process.stderr.write(chunk);
    output = boundedAppend(output, chunk.toString());
  });
  const code = await new Promise((resolvePromise, reject) => {
    child.once("error", reject);
    child.once("close", (exitCode) => resolvePromise(exitCode ?? 1));
  });
  if (runId !== undefined && Number.isInteger(child.pid)) {
    appendOwnershipEvent({
      databaseUrl: testDatabaseUrl(),
      event: {
        type: "coordinator-child-exited",
        pid: child.pid,
      },
      runId,
      workerId: `coordinator-${process.pid}`,
    });
  }
  const wallMs = Date.now() - startedAt;
  if (code !== 0) {
    console.error(
      `[test-harness] ${label} failed exit=${code} category=${classifyHarnessFailure(output)} wallMs=${wallMs}`,
    );
  } else {
    console.log(`[test-harness] ${label} passed wallMs=${wallMs}`);
  }
  return { code, output, wallMs };
}

function pnpmCommand(args) {
  const npmExecPath = process.env.npm_execpath;
  if (typeof npmExecPath === "string" && npmExecPath !== "") {
    return {
      executable: process.execPath,
      args: [npmExecPath, ...args],
      shell: false,
    };
  }
  const corepackPnpm = join(
    dirname(process.execPath),
    "node_modules",
    "corepack",
    "dist",
    "pnpm.js",
  );
  if (existsSync(corepackPnpm)) {
    return {
      executable: process.execPath,
      args: [corepackPnpm, ...args],
      shell: false,
    };
  }
  return {
    executable: process.platform === "win32" ? "pnpm.cmd" : "pnpm",
    args,
    shell: process.platform === "win32",
  };
}

export function classifyHarnessFailure(output) {
  if (
    /(?:remaining connection slots|too many clients|SQLSTATE\s*53300|code\s*53300)/i.test(
      output,
    )
  ) {
    return "postgres-connection-pressure";
  }
  if (
    /(?:heap out of memory|JavaScript heap|ENOMEM|allocation failed)/i.test(
      output,
    )
  ) {
    return "memory-pressure";
  }
  if (
    /(?:worker.*(?:exited|terminated|crashed)|ERR_IPC_CHANNEL_CLOSED|Child process.*exit)/i.test(
      output,
    )
  ) {
    return "worker-process-failure";
  }
  if (
    /(?:prisma migrate|migrate:deploy|migration.*failed|P3\d{3})/i.test(output)
  ) {
    return "migration-failure";
  }
  return "test-failure";
}

function boundedAppend(current, next) {
  const combined = current + next;
  return combined.length <= outputLimit
    ? combined
    : combined.slice(-outputLimit);
}

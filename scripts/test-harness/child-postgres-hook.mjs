import { createRequire } from "node:module";
import { resolve } from "node:path";

import { appendOwnershipEvent } from "./ownership-state.mjs";
import { installPostgresOwnershipRuntime } from "./postgres-ownership-hooks.mjs";
import { currentProcessIdentity } from "./process-identity.mjs";

const runId =
  process.env.VAYLET_TEST_RUN_ID ?? process.env.VAYLET_TEST_CLUSTER_RUN_ID;

if (runId) {
  const databaseUrl =
    process.env.TEST_DATABASE_URL ??
    process.env.MIGRATION_DATABASE_URL ??
    process.env.DATABASE_URL ??
    "postgresql://valet:valet@127.0.0.1:5432/valet";
  const appendEvent = (event) =>
    appendOwnershipEvent({ databaseUrl, event, runId });
  if (process.env.VAYLET_SELF_LEDGER_CHILD === "1") {
    appendEvent({
      type: "child-started",
      pid: process.pid,
      processIdentity: currentProcessIdentity(),
      selfTracked: true,
    });
    process.once("exit", () => {
      appendEvent({
        type: "child-exited",
        pid: process.pid,
        selfTracked: true,
      });
    });
  }
  const requireFromWorkingDirectory = createRequire(
    resolve(process.cwd(), "package.json"),
  );
  let pg;
  try {
    pg = requireFromWorkingDirectory("pg");
  } catch {
    pg = undefined;
  }
  if (pg !== undefined) {
    installPostgresOwnershipRuntime({
      appendEvent,
      pg,
    });
  }
}

import { createRequire } from "node:module";
import { resolve } from "node:path";

import { appendOwnershipEvent } from "./ownership-state.mjs";
import { installPostgresTestRuntime } from "./postgres-runtime.mjs";
import { postgresProfile } from "./resource-budget.mjs";

const projectName = process.env.VAYLET_TEST_PROJECT;
const profileName = process.env.VAYLET_POSTGRES_PROFILE;
const runId = process.env.VAYLET_TEST_RUN_ID;
const databaseUrl =
  process.env.TEST_DATABASE_URL ??
  process.env.MIGRATION_DATABASE_URL ??
  "postgresql://valet:valet@127.0.0.1:5432/valet";

if (!projectName || !profileName || !runId) {
  throw new Error(
    "PostgreSQL Vitest project is missing harness ownership environment.",
  );
}

const requireFromPackage = createRequire(
  resolve(process.cwd(), "package.json"),
);
const pg = requireFromPackage("pg");
const childProcess = requireFromPackage("node:child_process");
const appendEvent = (event) =>
  appendOwnershipEvent({ databaseUrl, event, runId });

installPostgresTestRuntime({
  appendEvent,
  childProcess,
  pg,
  profile: postgresProfile(profileName),
  projectName,
});

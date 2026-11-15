// For a fresh, separately tagged W26 PG17 disposable fixture only.
// Never reuse this config for production, QA, Fresh2, or W9 recovery.
import { resolve } from "node:path";
import { readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import process from "node:process";
import {
  assertW26Fixture,
  inspectW26Container,
} from "./pg17-fixture-guard.mjs";

const reviewedPrime = resolve(
  process.env.ISSUE416_W26_REVIEWED_PRIME_ROOT ?? "",
);
// The initial 131-file PG17 migration source was reviewed at this exact SHA.
// Prime may move independently: reject any migration/schema content change.
const reviewedSqlSha = "d8a470d26b6d37e1e100c7083b12c29be9eaaaf6";
function git(...args) {
  return execFileSync("git", ["-C", reviewedPrime, ...args], {
    encoding: "utf8",
    timeout: 6000,
    windowsHide: true,
  }).trim();
}
const owned = {
  purpose: "REPEAT_CUTOVER",
  role: process.env.ISSUE416_W26_RUNTIME_ROLE,
  database: process.env.ISSUE416_W26_DATABASE,
  container: process.env.ISSUE416_W26_CONTAINER,
  containerId: process.env.ISSUE416_W26_CONTAINER_ID,
  url: process.env.ISSUE416_W26_PG17_URL,
  mutationConsent: process.env.ISSUE416_W26_ALLOW_MUTATION,
};

if (process.env.ISSUE416_W26_ALLOW_MIGRATIONS !== "W26_FRESH_SQL_SOURCE_ONLY") {
  throw new Error("W26_PG17_MIGRATION_OPT_IN_REQUIRED");
}
assertW26Fixture(owned, inspectW26Container(owned.container), {});
if (process.env.MIGRATION_DATABASE_URL !== owned.url) {
  throw new Error("W26_PG17_MIGRATION_TARGET_MISMATCH");
}
if (
  !process.env.ISSUE416_W26_REVIEWED_PRIME_ROOT ||
  git("status", "--porcelain", "--", "packages/database/prisma") !== "" ||
  git(
    "diff",
    "--name-only",
    reviewedSqlSha,
    "HEAD",
    "--",
    "packages/database/prisma",
  ) !== ""
) {
  throw new Error("W26_PG17_REVIEWED_PRIME_SOURCE_PIN_REQUIRED");
}
const prismaDirectory = resolve(reviewedPrime, "packages/database/prisma");
const migrationsDirectory = resolve(prismaDirectory, "migrations");
if (
  readdirSync(migrationsDirectory, { withFileTypes: true }).filter((entry) =>
    entry.isDirectory(),
  ).length !== 131
) {
  throw new Error("W26_PG17_EXPECTED_131_MIGRATIONS");
}
export default {
  schema: resolve(prismaDirectory, "schema.prisma"),
  migrations: { path: migrationsDirectory },
  datasource: { url: owned.url },
};

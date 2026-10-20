import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { URL } from "node:url";

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

test("API does not register any new Investigation controller in production", () => {
  const moduleSource = read("apps/api/src/modules/management/management.module.ts");
  assert.match(moduleSource, /process\.env\.NODE_ENV === "development" \|\| process\.env\.NODE_ENV === "test"/);
  assert.match(moduleSource, /\.\.\.localInvestigationControllers/g);
  assert.doesNotMatch(moduleSource,
    /^\s{4}AuditInvestigation(?:Search|Timeline)Controller,\s*$/m);
  assert.match(moduleSource, /ManagementAuditController,/);
});

test("production Audit Events never mounts unapproved Investigation from URL opt-in", () => {
  const ui = read("apps/dashboard/src/features/audit/audit-page.tsx");
  assert.match(ui, /const showSwitch = investigationLocalOnly && canReview &&/);
  assert.match(ui, /process\.env\.NODE_ENV === "development" \|\| process\.env\.NODE_ENV === "test"/);
  assert.match(ui, /<AuditEventsContent \/>/);
});

test("production migrate:deploy checks Issue #300 deferral before Prisma spawn", () => {
  const migration = read("packages/database/scripts/run-migrate-deploy.mjs");
  assert.match(migration, /assertIssue300ProductionMigrationsDeferred\(\)/);
  assert(migration.indexOf("assertIssue300ProductionMigrationsDeferred()") <
    migration.indexOf("parseMigrationDatabaseUrl("));
});

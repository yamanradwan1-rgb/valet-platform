import assert from "node:assert/strict";
import test from "node:test";

import { adviseLocalPrecheck } from "./local-precheck-policy.mjs";

test("local-only Dashboard change recommends package checks without bypassing CI", () => {
  const p = adviseLocalPrecheck([
    "apps/dashboard/src/features/help/context-help.tsx",
  ]);
  assert.equal(p.category, "application-local");
  assert.ok(p.commands.some((line) => line.includes("vitest related --run")));
  assert.ok(p.commands.some((line) => line.includes("@valet/dashboard test")));
  assert.equal(p.fullPullRequestCiRequired, true);
});

test("changed test file gets focused Vitest and never a required CI skip", () => {
  const p = adviseLocalPrecheck([
    "apps/customer/src/features/session/customer.test.ts",
  ]);
  assert.ok(
    p.commands.some((line) =>
      line.includes("vitest run src/features/session/customer.test.ts"),
    ),
  );
  assert.equal(p.fullPullRequestCiRequired, true);
});

test("API authorization and shared contract changes fail closed", () => {
  for (const file of [
    "apps/api/src/modules/authorization/guard.ts",
    "packages/contracts/src/index.ts",
    "packages/employee-client/src/index.ts",
    "packages/database/prisma/schema.prisma",
    "scripts/test-harness/test-classification.mjs",
    ".github/workflows/ci.yml",
    "docs/decisions/DEC-107.md",
    "pnpm-lock.yaml",
  ]) {
    const p = adviseLocalPrecheck([file]);
    assert.equal(p.category, "protected-or-shared", file);
    assert.ok(p.commands.includes("pnpm test:non-postgres"));
    assert.ok(
      p.manualGates.some((line) => line.includes("PostgreSQL")),
      file,
    );
    assert.equal(p.fullPullRequestCiRequired, true);
  }
});

test("unknown input and broad changes cannot select a narrow CI gate", () => {
  assert.equal(
    adviseLocalPrecheck(["mystery/foo.ts"]).category,
    "unknown-impact",
  );
  assert.equal(
    adviseLocalPrecheck([
      "apps/dashboard/src/a.ts",
      "apps/customer/src/b.ts",
      "apps/valet/src/c.ts",
    ]).category,
    "multi-package-impact",
  );
  assert.equal(
    adviseLocalPrecheck(["../secrets.ts"]).category,
    "untrusted-path",
  );
});

test("docs-only does not silently skip PR CI and empty changes do not invent tests", () => {
  const doc = adviseLocalPrecheck(["docs/quality/test-plan.md"]);
  assert.equal(doc.category, "documentation");
  assert.equal(doc.fullPullRequestCiRequired, true);
  assert.equal(adviseLocalPrecheck([]).commands.length, 0);
});

test("executable README and package-local docs cannot masquerade as docs-only", () => {
  for (const path of [
    "apps/dashboard/src/install.md",
    "scripts/review.md",
    "packages/contracts/src/notes.md",
  ]) {
    assert.notEqual(adviseLocalPrecheck([path]).category, "documentation");
  }
  assert.equal(
    adviseLocalPrecheck(["docs/quality/report.md"]).category,
    "documentation",
  );
});

test("Playwright, Node script and ambiguous spec files never get a Vitest run suggestion", () => {
  for (const file of [
    "apps/dashboard/src/feature/mfa.spec.ts",
    "apps/dashboard/e2e/auth.spec.ts",
    "apps/valet/src/worker.test.mjs",
    "apps/dashboard/src/worker.test.mts",
    "apps/dashboard/src/worker.test.cts",
  ]) {
    const p = adviseLocalPrecheck([file]);
    assert.equal(p.fullPullRequestCiRequired, true);
    assert.equal(p.commands.includes("pnpm test:non-postgres"), true, file);
    assert.ok(
      p.commands.every((line) => !line.includes("vitest run")),
      file,
    );
  }
});

test("path traversal, deletion and rename never produce a narrow package plan", () => {
  for (const path of [
    "apps/dashboard/src/../lib/private.ts",
    "apps/dashboard//src/file.ts",
    "apps/dashboard/src/./file.ts",
    "apps/dashboard/src/file;unsafe.ts",
  ]) {
    assert.equal(adviseLocalPrecheck([path]).category, "untrusted-path", path);
  }
  assert.equal(
    adviseLocalPrecheck(["apps/dashboard/src/file.test.ts"], {
      structuralChanges: ["D"],
    }).category,
    "deleted-or-renamed",
  );
  assert.equal(
    adviseLocalPrecheck(
      ["apps/dashboard/src/old.ts", "apps/customer/src/new.ts"],
      { structuralChanges: ["R100"] },
    ).category,
    "deleted-or-renamed",
  );
});

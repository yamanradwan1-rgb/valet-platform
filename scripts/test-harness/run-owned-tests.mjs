import { existsSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { runHarnessCommand } from "./command-runner.mjs";
import {
  acquireInvocationLease,
  assertIssue414Phase23HttpTestTarget,
  testDatabaseUrl,
} from "./invocation-lease.mjs";
import { classifyPackageTests } from "./test-classification.mjs";
import { preflightIssue414Phase23HttpBeforeLease } from "./issue414-phase23-http-target.mjs";

const [packageKind, config, ...requested] = process.argv.slice(2);
if (!packageKind || !config || requested.length === 0) {
  throw new Error(
    "Usage: run-owned-tests.mjs <api|database> <config> <test-file> [test-file...].",
  );
}
// This runner acquires the generic PostgreSQL lease before Vitest loads its
// config. It must never run Issue429's private config, whose target preflight
// lives in async config evaluation before *its own* globalSetup.
const privateIssue429Config = fileURLToPath(
  new URL("../../packages/database/vitest.issue429-ocr.config.mjs", import.meta.url),
);
const resolvedConfig = resolve(process.cwd(), config);
if (existsSync(resolvedConfig) &&
    realpathSync(resolvedConfig) === realpathSync(privateIssue429Config)) {
  throw new Error(
    "Issue429 private OCR must use its dedicated prelease-gated Vitest config directly.",
  );
}
// Fail closed before expensive test discovery on the opt-in Issue414 HTTP
// profile. An invalid target must never wait for, or acquire, a DB lease.
if (
  process.env.ISSUE414_W7_HTTP_TABS_PROFILE === "I_OWN_EXCLUSIVE_LOCAL_PG17"
) {
  testDatabaseUrl();
}
const p23HttpRequested = requested.some((file) =>
  /(?:^|[\\/])management-alert-phase23-http\.integration\.test\.ts$/.test(
    file,
  ),
);
if (p23HttpRequested) {
  assertIssue414Phase23HttpTestTarget();
  await preflightIssue414Phase23HttpBeforeLease();
}
const sourcePrefix = packageKind === "api" ? "test" : "src";
const rootDir = resolve(process.cwd(), sourcePrefix);
const ownership = classifyPackageTests({ packageKind, rootDir });
const normalized = requested.map((file) => file.replaceAll("\\", "/"));
const groups = new Map();

for (const file of normalized) {
  const sourceAdjacentApiTest =
    packageKind === "api" && file.startsWith("src/");
  const relativeFile = file.startsWith(`${sourcePrefix}/`)
    ? file.slice(sourcePrefix.length + 1)
    : file;
  const matches = Object.entries(ownership).filter(([, files]) =>
    files.includes(relativeFile),
  );
  if (matches.length !== 1) {
    throw new Error(
      `Requested test ${file} belongs to ${matches.length} projects.`,
    );
  }
  const [project] = matches[0];
  const list = groups.get(project) ?? [];
  list.push(
    sourceAdjacentApiTest ? relativeFile : `${sourcePrefix}/${relativeFile}`,
  );
  groups.set(project, list);
}

// The P23 HTTP test is owned by api-postgres-race. An invocation selecting
// another race file can acquire this project's lease before its globalSetup
// validates the fixture. All such focused invocations need the same prelease
// attestation; avoid repeating it when the exact P23 filename was checked.
if (groups.has("api-postgres-race") && !p23HttpRequested) {
  await preflightIssue414Phase23HttpBeforeLease();
}

let failed = false;
const needsPostgres = [...groups.keys()].some(
  (project) => !project.endsWith("-non-postgres"),
);
const lease = needsPostgres
  ? await acquireInvocationLease(`focused-${packageKind}`, {
      selectedProjects: [...groups.keys()],
    })
  : { cleanup: async () => {}, release: async () => {} };
try {
  for (const [project, files] of groups) {
    try {
      const result = await runHarnessCommand(
        [
          "exec",
          "vitest",
          "run",
          "--config",
          config,
          "--project",
          project,
          ...files,
        ],
        { label: `${project}:${files.join(",")}` },
      );
      if (result.code !== 0) failed = true;
    } finally {
      if (!project.endsWith("-non-postgres")) await lease.cleanup();
    }
  }
} finally {
  await lease.release();
}
// Vitest can prove HTTP/PG assertions but cannot attest its own parent
// cluster cleanup. Finalize evidence ONLY after successful owned lease release.
if (
  !failed &&
  lease.owned === true &&
  process.env.ISSUE414_W7_HTTP_TABS_PROFILE === "I_OWN_EXCLUSIVE_LOCAL_PG17" &&
  normalized.some(
    (file) =>
      file === "issue414-http-foreground-load.integration.test.ts" ||
      file === "test/issue414-http-foreground-load.integration.test.ts",
  )
) {
  const evidencePath = resolve(
    process.cwd(),
    "../../tmp/issue414-w7-owned/http-foreground-tabs.json",
  );
  const evidence = JSON.parse(readFileSync(evidencePath, "utf8"));
  if (
    evidence.runId !== lease.runId ||
    evidence.inSuiteComplete !== true ||
    evidence.resultCount !== 3 ||
    evidence.cleanupVerified !== false ||
    evidence.complete !== false
  ) {
    throw new Error(
      "W7 HTTP evidence was not eligible for post-cleanup attestation.",
    );
  }
  evidence.cleanupVerified = true;
  evidence.complete = true;
  evidence.cleanupProof =
    "focused runner finished owned PostgreSQL cleanup and lease release";
  writeFileSync(evidencePath, JSON.stringify(evidence, null, 2));
}
if (failed) process.exitCode = 1;

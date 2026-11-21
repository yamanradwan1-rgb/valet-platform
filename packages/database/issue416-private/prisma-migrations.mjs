import { execFile } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { preflightSanitizedChild } from "./target-preflight.mjs";
import { sanitizedChildEnvironment } from "./target-contract.mjs";

const execFileAsync = promisify(execFile);
const packageRoot = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(new URL("../package.json", import.meta.url));
const childPreflight = new URL("./child-preflight.mjs", import.meta.url).href;

// Resolve the installed Prisma CLI from this package; forbid user-supplied
// executable paths, command injection, pnpm shell launch and generic fallbacks.
export function resolvePrismaMigrateInvocation() {
  const pkgPath = require.resolve("prisma/package.json");
  const pkg = require(pkgPath);
  if (pkg.name !== "prisma" || !/^7\.9\.1$/.test(pkg.version) ||
      pkg.bin?.prisma !== "build/index.js") {
    throw new Error("Issue416 PG17 expects the pinned Prisma 7.9.1 CLI.");
  }
  const cli = join(dirname(pkgPath), pkg.bin.prisma);
  const fromPackage = relative(packageRoot, cli);
  if (fromPackage === ".." || fromPackage.startsWith(`..${sep}`)) {
    // pnpm normally puts the real CLI in a sibling workspace node_modules.
    const fromRepository = relative(fileURLToPath(new URL("../../../", import.meta.url)), cli);
    if (fromRepository === ".." || fromRepository.startsWith(`..${sep}`)) {
      throw new Error("Issue416 Prisma CLI escaped the checked-out repository.");
    }
  }
  return Object.freeze({ cli, argv: ["migrate", "deploy"] });
}

export function assertMigrationMode(mode) {
  if (mode !== "--apply") {
    throw new Error("Issue416 PG17 migration requires explicit --apply, without extra arguments.");
  }
}

export async function migrateAttestedIssue416(env = process.env) {
  const invocation = resolvePrismaMigrateInvocation();
  await preflightSanitizedChild(env); // No SQL before parent and child attestation.
  const childEnv = sanitizedChildEnvironment(env);
  // Prisma's own child loads this as its first Node import before CLI or DDL.
  childEnv.NODE_OPTIONS = `--import=${childPreflight}`;
  const result = await execFileAsync(process.execPath, [invocation.cli, ...invocation.argv], {
    cwd: packageRoot,
    env: childEnv,
    timeout: 180_000,
    windowsHide: true,
    encoding: "utf8",
    maxBuffer: 128 * 1024,
  });
  // Prisma can perform multiple child operations. Re-attest the same private
  // Docker/SQL target before accepting a successful migration result.
  await preflightSanitizedChild(env);
  return { exitCode: 0, output: result.stdout };
}

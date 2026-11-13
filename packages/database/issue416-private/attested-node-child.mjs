import { execFile } from "node:child_process";
import { realpathSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { preflightSanitizedChild } from "./target-preflight.mjs";
import { sanitizedChildEnvironment } from "./target-contract.mjs";

const run = promisify(execFile);
const packageRoot = fileURLToPath(new URL("../", import.meta.url));
const preflightImport = new URL("./child-preflight.mjs", import.meta.url).href;

export function resolveAttestedScript(script) {
  if (typeof script !== "string" || !/\.(?:mjs|js|cjs)$/i.test(script) ||
      script.startsWith("-") || /^[a-z]:[\\/]/i.test(script) ||
      script.startsWith("\\\\")) {
    throw new Error("Issue416 DDL child must be a Node script, not a CLI flag.");
  }
  const path = resolve(packageRoot, script);
  const rel = relative(packageRoot, path);
  if (rel === "" || rel === ".." || rel.startsWith(`..${sep}`) ||
      resolve(packageRoot, rel) !== path) {
    throw new Error("Issue416 DDL child script must stay under packages/database.");
  }
  const realRoot = realpathSync(packageRoot);
  const real = realpathSync(path);
  const relativeReal = relative(realRoot, real);
  if (relativeReal === ".." || relativeReal.startsWith(`..${sep}`)) {
    throw new Error("Issue416 DDL child must not resolve through an external symlink.");
  }
  return path;
}

// Future migrations/provisioners may use this explicit, opt-in child wrapper.
// Both parent and *child before its entrypoint* must independently attest PG17.
export async function runAttestedNode(script, args = [], env = process.env) {
  const path = resolveAttestedScript(script);
  if (!Array.isArray(args) || args.some((arg) => typeof arg !== "string")) {
    throw new Error("Issue416 DDL child arguments must be string values.");
  }
  await preflightSanitizedChild(env);
  const clean = sanitizedChildEnvironment(env);
  clean.NODE_OPTIONS = `--import=${preflightImport}`;
  return run(process.execPath, [path, ...args], {
    cwd: packageRoot,
    env: clean,
    timeout: 120_000,
    encoding: "utf8",
    maxBuffer: 128 * 1024,
    windowsHide: true,
  });
}

import { createRequire } from "node:module";
import { resolve } from "node:path";

import { installNonPostgresGuard } from "./postgres-runtime.mjs";

const projectName = process.env.VAYLET_TEST_PROJECT;
if (!projectName)
  throw new Error("Vitest project is missing VAYLET_TEST_PROJECT.");

const requireFromPackage = createRequire(
  resolve(process.cwd(), "package.json"),
);
let pg;
try {
  pg = requireFromPackage("pg");
} catch {
  pg = undefined;
}
if (pg !== undefined) {
  installNonPostgresGuard({
    childProcess: requireFromPackage("node:child_process"),
    pg,
    projectName,
  });
}

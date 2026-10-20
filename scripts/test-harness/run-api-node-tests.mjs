import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { classifyPackageTests } from "./test-classification.mjs";

const apiRoot = fileURLToPath(new URL("../../apps/api/", import.meta.url));
const tests = classifyPackageTests({
  packageKind: "api",
  rootDir: fileURLToPath(new URL("../../apps/api/test/", import.meta.url)),
});
const nodeTests = [];
for (const [project, owned] of Object.entries(tests)) {
  for (const file of owned) {
    if (!file.endsWith(".test.mjs")) continue;
    if (project !== "api-non-postgres") {
      throw new Error(`Native Node test was assigned unsafe DB lane: ${file}`);
    }
    nodeTests.push(`test/${file}`);
  }
}
if (nodeTests.length === 0) throw new Error("Native Node tests were not discovered.");
const result = spawnSync(process.execPath, ["--test", ...nodeTests.sort()], {
  cwd: apiRoot,
  stdio: "inherit",
  env: process.env,
  windowsHide: true,
});
if (result.error) throw result.error;
if (result.status !== 0) process.exitCode = result.status ?? 1;

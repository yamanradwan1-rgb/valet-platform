import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../../..");
const node = process.execPath;
const checks = [
  ["T01–T48 independent oracle (not DB proof)",
    ["--test", "apps/api/test/issue300-acceptance/independent-oracle.test.mjs"]],
  ["Disposable lease preflight unit (no PostgreSQL connection)",
    ["--test", "packages/database/test/issue300/disposable-lease-guard.test.mjs"]],
  ["T01–T70 ledger completeness", ["scripts/validation/issue300/build-ledger.mjs"]],
];
let failed = false;
for (const [label, args] of checks) {
  const result = spawnSync(node, args, {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
    timeout: 30_000,
  });
  process.stdout.write(`=== ${label} ===\n${result.stdout ?? ""}`);
  if (result.error || result.status !== 0) {
    process.stderr.write(result.stderr ?? String(result.error ?? "unknown failure"));
    failed = true;
  }
}
if (failed) process.exitCode = 1;
else console.log("PASS: static/oracle checks; G2/DB/HTTP remain GAP");

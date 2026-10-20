import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";

// G2 static-only, not visual/browser acceptance. Never mutates the candidate.
const [rootArg, manifestArg] = process.argv.slice(2);
if (!rootArg || !manifestArg) {
  console.error("Usage: node verify-live-ui-exceptions.mjs <candidate> <G0-manifest>");
  process.exitCode = 2;
} else {
  const root = resolve(rootArg);
  const manifest = JSON.parse(readFileSync(resolve(manifestArg), "utf8"));
  if (manifest.issue !== 300 || manifest.protectedFiles?.length !== 124) {
    throw Error("Invalid G0 protected file manifest");
  }
  // Owner's narrow LIVE source-data exception; no CSS/Help/Shell in this list.
  const dataOnlyExceptions = new Set([
    "apps/dashboard/src/features/audit/audit-page.tsx",
    "apps/dashboard/src/features/audit/investigation-demo-types.ts",
    "apps/dashboard/src/features/audit/investigation-event-drawer.tsx",
    "apps/dashboard/src/features/audit/investigation-search-panel.tsx",
    "apps/dashboard/src/features/audit/investigation-workspace.tsx",
  ]);
  const manifestPaths = new Set();
  const failures = [];
  const observedExceptions = [];
  let matched = 0;
  for (const entry of manifest.protectedFiles) {
    const target = resolve(root, entry.path);
    const rel = relative(root, target);
    if (isAbsolute(entry.path) || rel === ".." || rel.startsWith(".." + sep) ||
        isAbsolute(rel) || manifestPaths.has(entry.path)) {
      throw Error("Unsafe/duplicate G0 file reference");
    }
    manifestPaths.add(entry.path);
    const hash = createHash("sha256").update(readFileSync(target)).digest("hex");
    if (hash.toLowerCase() === entry.sha256.toLowerCase()) {
      matched += 1;
    } else if (dataOnlyExceptions.has(entry.path)) {
      observedExceptions.push(entry.path);
    } else {
      failures.push(entry.path);
    }
  }
  for (const exception of dataOnlyExceptions) {
    if (!manifestPaths.has(exception)) throw Error("Unpinned LIVE exception " + exception);
  }
  console.log(`G0 unchanged SHA256: ${matched}/124`);
  console.log(`Owner-exception source changes: ${observedExceptions.length}/5`);
  for (const name of observedExceptions) console.log("REVIEW REQUIRED: " + name);
  for (const name of failures) console.error("UNAPPROVED: " + name);
  if (failures.length) process.exitCode = 1;
  else console.log("PASS: no unexpected protected-file hash changes (source exceptions still need human diff review)");
}

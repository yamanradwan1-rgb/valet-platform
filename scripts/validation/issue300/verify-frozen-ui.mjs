import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";

// Read-only, deterministic G0 integrity check. Explicitly name the candidate root.
const [rootArg, manifestArg] = process.argv.slice(2);
if (!rootArg || !manifestArg) {
  console.error("Usage: node verify-frozen-ui.mjs <candidate-worktree> <FROZEN_UI_MANIFEST.json>");
  process.exitCode = 2;
} else {
  const root = resolve(rootArg);
  const manifest = JSON.parse(readFileSync(resolve(manifestArg), "utf8"));
  if (manifest.issue !== 300 ||
      manifest.protectedFileCount !== 124 ||
      manifest.protectedFiles?.length !== 124) {
    throw Error("G0 manifest identity/count mismatch");
  }
  const seen = new Set();
  const failures = [];
  for (const entry of manifest.protectedFiles) {
    if (!entry.path.startsWith("apps/dashboard/") ||
        isAbsolute(entry.path) || entry.path.includes("\\") ||
        !/^[0-9a-f]{64}$/i.test(entry.sha256) || seen.has(entry.path)) {
      throw Error(`Malformed protected entry: ${entry.path}`);
    }
    seen.add(entry.path);
    const target = resolve(root, entry.path);
    const rel = relative(root, target);
    if (rel.startsWith(".." + sep) || rel === ".." || isAbsolute(rel)) {
      throw Error(`Unsafe path: ${entry.path}`);
    }
    let actual;
    try {
      actual = createHash("sha256").update(readFileSync(target)).digest("hex");
    } catch {
      failures.push(`${entry.path}: missing/unreadable`);
      continue;
    }
    if (actual.toLowerCase() !== entry.sha256.toLowerCase()) {
      failures.push(`${entry.path}: expected ${entry.sha256}, actual ${actual}`);
    }
  }
  console.log(`G0 manifest ${manifest.frozenUiSourceSha}: checked ${seen.size} protected files under ${root}`);
  if (failures.length) {
    console.error(failures.join("\n"));
    process.exitCode = 1;
  } else {
    console.log("PASS: zero protected SHA differences");
  }
}

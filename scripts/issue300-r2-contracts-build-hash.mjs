import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

/** Hash the complete separately loaded @valet/contracts CommonJS output tree. */
export function contractsBundleHash(base) {
  const entries = readdirSync(base, { recursive: true, withFileTypes: true });
  const files = entries.map((entry) => {
    assert(!entry.isSymbolicLink(), "BUILD_CONTRACTS_REPARSE_DENIED");
    if (entry.isDirectory()) return null;
    assert(entry.isFile(), "BUILD_CONTRACTS_UNKNOWN_FILE_TYPE");
    const file = join(entry.parentPath, entry.name);
    assert(lstatSync(file).nlink === 1, "BUILD_CONTRACTS_HARDLINK_DENIED");
    return file;
  }).filter(Boolean);
  assert(files.length > 0 && files.length <= 12000,
    "BUILD_CONTRACTS_FILE_COUNT_DENIED");
  assert(files.includes(join(base, "index.js")),
    "BUILD_CONTRACTS_ENTRYPOINT_MISSING");
  const hash = createHash("sha256");
  for (const file of files.sort((a, b) => a.localeCompare(b, "en"))) {
    hash.update(relative(base, file).replaceAll("\\", "/"))
      .update("\0").update(readFileSync(file)).update("\0");
  }
  return hash.digest("hex");
}

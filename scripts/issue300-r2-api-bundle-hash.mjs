import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/** Exact compiled tree fingerprint, including imported modules, not main.js only. */
export function r2ApiBundleHash(base) {
  const files = readdirSync(base, { withFileTypes: true, recursive: true })
    .map((entry) => {
      assert(!entry.isSymbolicLink(), "Unexpected compiled API symlink");
      if (entry.isDirectory()) return null;
      assert(entry.isFile(), "Unexpected compiled API artifact type");
      const file = join(entry.parentPath, entry.name);
      assert(lstatSync(file).nlink === 1, "Hard-linked API artifact denied");
      return file;
    }).filter(Boolean);
  assert(files.length <= 12000, "Unexpected compiled API artifact count");
  assert(files.includes(join(base, "main.js")),
    "Compiled API entrypoint missing");
  const hash = createHash("sha256");
  for (const file of files.sort((a, b) => a.localeCompare(b, "en"))) {
    hash.update(file.slice(base.length + 1).replaceAll("\\", "/"))
      .update("\0")
      .update(readFileSync(file))
      .update("\0");
  }
  return hash.digest("hex");
}

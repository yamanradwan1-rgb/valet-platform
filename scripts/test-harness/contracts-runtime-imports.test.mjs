import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const sourceRoot = fileURLToPath(new URL("../../packages/contracts/src/", import.meta.url));

test("published Contracts runtime imports have Node-resolvable relative extensions", () => {
  const sourceFiles = readdirSync(sourceRoot).filter(
    (file) => file.endsWith(".ts") && !file.endsWith(".test.ts"),
  );
  assert.ok(sourceFiles.includes("index.ts"));
  assert.ok(sourceFiles.includes("map-setup.ts"));

  const invalid = [];
  for (const file of sourceFiles) {
    const source = readFileSync(join(sourceRoot, file), "utf8");
    const staticRelativeImport = /\bfrom\s*["'](\.{1,2}\/[^"']+)["']/g;
    for (const [, specifier] of source.matchAll(staticRelativeImport)) {
      if (!/\.(?:js|mjs|json)$/.test(specifier))
        invalid.push(`${file}: ${specifier}`);
    }
  }
  assert.deepEqual(invalid, []);
});

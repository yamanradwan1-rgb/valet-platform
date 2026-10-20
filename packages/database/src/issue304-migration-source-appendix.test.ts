import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { issue300AppendedMigrationDirectories } from "./issue300-migration-source-appendix.js";
import {
  expectedCurrentMigrationDirectories,
  issue304AppendedMigrationDirectories,
} from "./issue304-migration-source-appendix.js";
import { expectedMigrationDirectories } from "./migration-manifest.js";

describe("Issue #304 additive forward-only migration history", () => {
  it("keeps the original 1..93 and Issue #300 94..96 frozen, appending 97 exactly once", () => {
    expect(expectedMigrationDirectories).toHaveLength(93);
    expect(issue300AppendedMigrationDirectories).toHaveLength(3);
    expect(issue304AppendedMigrationDirectories).toEqual([
      "20261020009700_issue304_key_slot_label",
    ]);
    expect(expectedCurrentMigrationDirectories).toHaveLength(97);
    const migrationRoot = fileURLToPath(new URL("../prisma/migrations/", import.meta.url));
    const actual = readdirSync(migrationRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
    expect(actual).toEqual(expectedCurrentMigrationDirectories);
  });
});

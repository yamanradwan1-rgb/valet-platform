import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { issue300AppendedMigrationDirectories } from "./issue300-migration-source-appendix.js";
import {
  expectedCurrentMigrationDirectories,
  issue304AppendedMigrationDirectories,
  subsequentAppendedMigrationDirectories,
} from "./issue304-migration-source-appendix.js";
import { expectedMigrationDirectories } from "./migration-manifest.js";

describe("Issue #304 additive forward-only migration history", () => {
  it("keeps migrations 1..97 frozen and appends approved 98..103 migrations in exact order", () => {
    expect(expectedMigrationDirectories).toHaveLength(93);
    expect(issue300AppendedMigrationDirectories).toHaveLength(3);
    expect(issue304AppendedMigrationDirectories).toEqual([
      "20261020009700_issue304_key_slot_label",
    ]);
    expect(subsequentAppendedMigrationDirectories).toEqual([
      "20261021009800_issue309_photo_view_anti_abuse_scope",
      "20261021009900_issue_309_management_photo_evidence_lock",
      "20261022010000_issue313_rating_analytics_read",
      "20261022010100_issue316_guest_information_contracts",
      "20261022010200_issue316_guest_information_authority",
      "20261026010300_issue346_resume_location_intake",
    ]);
    expect(expectedCurrentMigrationDirectories).toHaveLength(103);
    const migrationRoot = fileURLToPath(new URL("../prisma/migrations/", import.meta.url));
    const actual = readdirSync(migrationRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
    expect(actual).toEqual(expectedCurrentMigrationDirectories);
  });
});

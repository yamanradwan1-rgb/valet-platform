import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { issue300AppendedMigrationDirectories } from "./issue300-migration-source-appendix.js";
import {
  expectedCurrentMigrationDirectories,
  issue429AppendedMigrationDirectories,
  issue304AppendedMigrationDirectories,
  subsequentAppendedMigrationDirectories,
} from "./issue304-migration-source-appendix.js";
import { expectedMigrationDirectories } from "./migration-manifest.js";

describe("append-only migration source history", () => {
  it("preserves migrations 1..109 and appends Issue429 110 and Issue435 111 in exact order", () => {
    expect(expectedMigrationDirectories).toHaveLength(93);
    expect(issue300AppendedMigrationDirectories).toEqual([
      "20261018009400_issue_300_u05_birth_xid",
      "20261018009500_issue_300_option_b_task_relation_provenance",
      "20261018009600_issue_300_option_b_attribution_freeze",
    ]);
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
      "20261029010400_issue352_emergency_dispatch_type",
      "20261029010500_issue352_emergency_takeover_persistence",
      "20261030010600_issue363_session_bound_pending_mfa",
      "20261104010700_issue414_personal_alert_timing_preferences",
      "20261104010800_issue414_seen_receipts",
      "20261104010900_issue414_alt09_recorded_attention_index",
    ]);
    expect(issue429AppendedMigrationDirectories).toEqual([
      "20261105011000_issue429_ocr_shared_admission",
    ]);
    expect(expectedCurrentMigrationDirectories).toHaveLength(110);
    const migrationRoot = fileURLToPath(
      new URL("../prisma/migrations/", import.meta.url),
    );
    const actual = readdirSync(migrationRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    expect(actual).toEqual([
      ...expectedCurrentMigrationDirectories,
      "20261106011100_issue435_guest_push_registration_status",
    ]);
  });
});

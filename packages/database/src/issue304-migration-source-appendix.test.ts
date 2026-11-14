import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { issue300AppendedMigrationDirectories } from "./issue300-migration-source-appendix.js";
import {
  expectedCurrentMigrationDirectories,
  issue429AppendedMigrationDirectories,
  issue435AppendedMigrationDirectories,
  issue416AppendedMigrationDirectories,
  issue304AppendedMigrationDirectories,
  subsequentAppendedMigrationDirectories,
} from "./issue304-migration-source-appendix.js";
import { expectedMigrationDirectories } from "./migration-manifest.js";

describe("append-only migration source history", () => {
  it("preserves migrations 1..111 and enumerates dormant Issue416 sources", () => {
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
    expect(issue435AppendedMigrationDirectories).toEqual([
      "20261106011100_issue435_guest_push_registration_status",
    ]);
    expect(issue416AppendedMigrationDirectories).toEqual([
      "20261113011200_issue416_reserved_security_audit",
      "20261113011300_issue416_vap1_private_foundation",
      "20261113011400_issue416_vap1_private_codec",
      "20261113011500_issue416_vap1_private_lifecycle",
      "20261113011600_issue416_vap1_audit_gate",
      "20261113011700_issue416_vap1_key_boundary_guard",
      "20261113012000_issue416_vap1_atomic_reset_quota",
      "20261113012400_issue416_vap1_atomic_reset_quota_functions",
      "20261113012500_issue416_redeem_scope_contract",
      "20261113012600_issue416_private_reset_credentials",
      "20261113012700_issue416_reset_credential_receipt_binding",
      "20261113012800_issue416_reset_private_reservation_abi",
      "20261113012900_issue416_a01_limiter_fingerprint",
      "20261113013000_issue416_reset_commit_integrity",
    ]);
    expect(expectedCurrentMigrationDirectories).toHaveLength(125);
    const migrationRoot = fileURLToPath(
      new URL("../prisma/migrations/", import.meta.url),
    );
    const actual = readdirSync(migrationRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    expect(actual).toEqual(expectedCurrentMigrationDirectories);
  });
});

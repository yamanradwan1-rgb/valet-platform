import { issue300AppendedMigrationDirectories } from "./issue300-migration-source-appendix.js";
import { expectedMigrationDirectories } from "./migration-manifest.js";

/** Strict current history: preserve immutable migrations 1..93 and Issue #300's 94..96. */
export const issue304AppendedMigrationDirectories = [
  "20261020009700_issue304_key_slot_label",
] as const;

// Append-only migration history after #304. This records existing migration
// sources without changing their SQL or the approval status of their decisions.
// Include every actual migration in sequence rather than ignoring newer ones.
export const subsequentAppendedMigrationDirectories = [
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
] as const;

export const expectedCurrentMigrationDirectories = [
  ...expectedMigrationDirectories,
  ...issue300AppendedMigrationDirectories,
  ...issue304AppendedMigrationDirectories,
  ...subsequentAppendedMigrationDirectories,
] as const;

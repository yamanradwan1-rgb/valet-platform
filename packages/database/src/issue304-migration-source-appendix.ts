import { issue300AppendedMigrationDirectories } from "./issue300-migration-source-appendix.js";
import { expectedMigrationDirectories } from "./migration-manifest.js";

/** Strict current history: preserve immutable migrations 1..93 and Issue #300's 94..96. */
export const issue304AppendedMigrationDirectories = [
  "20261020009700_issue304_key_slot_label",
] as const;

// Append-only migration history after #304. The SQL for these accepted
// security and customer features is immutable; this inventory must include
// every actual migration in sequence rather than silently ignore newer ones.
export const subsequentAppendedMigrationDirectories = [
  "20261021009800_issue309_photo_view_anti_abuse_scope",
  "20261021009900_issue_309_management_photo_evidence_lock",
  "20261022010000_issue313_rating_analytics_read",
  "20261022010100_issue316_guest_information_contracts",
  "20261022010200_issue316_guest_information_authority",
] as const;

export const expectedCurrentMigrationDirectories = [
  ...expectedMigrationDirectories,
  ...issue300AppendedMigrationDirectories,
  ...issue304AppendedMigrationDirectories,
  ...subsequentAppendedMigrationDirectories,
] as const;

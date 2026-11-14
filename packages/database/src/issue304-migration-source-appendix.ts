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

// Issue #429 adds a forward-only OCR admission migration after the historical
// 1..109 sequence; keep the previously accepted appendix unchanged.
export const issue429AppendedMigrationDirectories = [
  "20261105011000_issue429_ocr_shared_admission",
] as const;

export const issue435AppendedMigrationDirectories = [
  "20261106011100_issue435_guest_push_registration_status",
] as const;

export const issue416AppendedMigrationDirectories = [
  "20261113011200_issue416_reserved_security_audit",
  // Dormant Option A security sources are still part of the immutable Git
  // migration inventory. Their presence does NOT imply Prisma ever applied
  // them to W9, QA, or production.
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
] as const;

export const expectedCurrentMigrationDirectories = [
  ...expectedMigrationDirectories,
  ...issue300AppendedMigrationDirectories,
  ...issue304AppendedMigrationDirectories,
  ...subsequentAppendedMigrationDirectories,
  ...issue429AppendedMigrationDirectories,
  ...issue435AppendedMigrationDirectories,
  ...issue416AppendedMigrationDirectories,
] as const;

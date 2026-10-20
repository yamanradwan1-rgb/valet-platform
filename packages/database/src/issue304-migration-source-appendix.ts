import { issue300AppendedMigrationDirectories } from "./issue300-migration-source-appendix.js";
import { expectedMigrationDirectories } from "./migration-manifest.js";

/** Strict current history: preserve immutable migrations 1..93 and Issue #300's 94..96. */
export const issue304AppendedMigrationDirectories = [
  "20261020009700_issue304_key_slot_label",
] as const;

export const expectedCurrentMigrationDirectories = [
  ...expectedMigrationDirectories,
  ...issue300AppendedMigrationDirectories,
  ...issue304AppendedMigrationDirectories,
] as const;

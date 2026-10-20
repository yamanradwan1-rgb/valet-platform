/** Strict append-only test expectation. The historical 1..93 manifest
 * remains untouched and retains its original SHA and ordering. */
export const issue300AppendedMigrationDirectories = [
  "20261018009400_issue_300_u05_birth_xid",
  "20261018009500_issue_300_option_b_task_relation_provenance",
  "20261018009600_issue_300_option_b_attribution_freeze",
] as const;

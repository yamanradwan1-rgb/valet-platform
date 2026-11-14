// Read-only W9 evidence record, NOT permission to repair or rerun migration113.
// Source: packages/database/issue416-private/
// ISSUE416_P0A_W9_RECOVERY_DECISION_2026-11-14.md §§ Exact provenance/history.
export const W9_113_MIGRATION =
  "20261113011300_issue416_vap1_private_foundation";

export const W9_113_FIRST_ROLLBACK = Object.freeze({
  id: "2b7ff130-f66b-4aed-9b02-7190b4365980",
  migration_name: W9_113_MIGRATION,
  checksum: "d938b237b846b7429bcaae980b6c1519a941852bdd57e719aa1ab3682fafddc9",
});

export const W9_113_SECOND_UNFINISHED = Object.freeze({
  id: "7b89a31b-782f-4c1c-9748-e7fd784428fb",
  migration_name: W9_113_MIGRATION,
  checksum: "746ce2403987eaadddebb816adea24c92b4ba9720a8da4ed007b890e0a1f8d36",
});

export function isExactW9FirstRollback(row) {
  return (
    row?.id === W9_113_FIRST_ROLLBACK.id &&
    row.migration_name === W9_113_FIRST_ROLLBACK.migration_name &&
    row.checksum === W9_113_FIRST_ROLLBACK.checksum &&
    row.finished_at == null &&
    row.rolled_back_at != null &&
    row.applied_steps_count === 0
  );
}

export function isW9SecondAttempt(row) {
  return (
    row?.id === W9_113_SECOND_UNFINISHED.id &&
    row.migration_name === W9_113_SECOND_UNFINISHED.migration_name
  );
}

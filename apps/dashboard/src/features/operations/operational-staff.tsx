import {
  staffManagementDisplayName,
  type OperationalAssignee,
} from "@valet/contracts";
import type { DashboardLocale } from "../../lib/i18n/locale";
import { operationsCopy } from "./operations-copy";
import { styles } from "./operations-ui";

export function operationalStaffName(
  assignee: OperationalAssignee | null,
  locale: DashboardLocale,
) {
  return assignee === null
    ? operationsCopy(locale).unassigned
    : staffManagementDisplayName(assignee.identity);
}

export function OperationalStaff({
  assignee,
  locale,
}: {
  readonly assignee: OperationalAssignee | null;
  readonly locale: DashboardLocale;
}) {
  const name = operationalStaffName(assignee, locale);
  return (
    <>
      <div className={styles.primaryText}>
        <bdi>{name}</bdi>
      </div>
      {assignee !== null && name !== assignee.identity.email ? (
        <div className={styles.muted}>
          <bdi dir="ltr">{assignee.identity.email}</bdi>
        </div>
      ) : null}
    </>
  );
}

import type { ManagementLocation, TaskOverviewEntry } from "@valet/contracts";
import { operationsCopy } from "../operations-copy";
import {
  formatOperationsTime,
  operationsTaskStatusLabel,
  operationsTaskTypeLabel,
} from "../operations-presentation";
import { OperationalStaff } from "../operational-staff";
import { taskTone } from "../operations-labels";
import { DetailAction, StatusBadge, styles } from "../operations-ui";
import listStyles from "../reference-list.module.css";

export function TaskTableBody(props: {
  readonly error: Error | null;
  readonly items: readonly TaskOverviewEntry[];
  readonly loading: boolean;
  readonly locale: "en" | "ar";
  readonly location: ManagementLocation;
  readonly onRetry: () => void;
  readonly onSelect: (item: TaskOverviewEntry) => void;
  readonly sourceEmpty: boolean;
}) {
  const t = operationsCopy(props.locale);
  if (props.loading) return <StateRow text={t.loading} />;
  if (props.error)
    return (
      <tr>
        <td className={listStyles.stateCell} colSpan={6}>
          <div className={listStyles.inlineError} role="alert">
            <span>{props.error.message}</span>
            <button
              className={styles.secondary}
              onClick={props.onRetry}
              type="button"
            >
              {t.retry}
            </button>
          </div>
        </td>
      </tr>
    );
  if (props.items.length === 0)
    return (
      <StateRow
        text={props.sourceEmpty ? t.noData : r04NoMatch(props.locale)}
      />
    );
  return (
    <>
      {props.items.map((item) => (
        <tr className={styles.row} key={item.taskId}>
          <td className={listStyles.primary}>
            {operationsTaskTypeLabel(item.taskType, props.locale)}
          </td>
          <td>
            <OperationalStaff assignee={item.assignee} locale={props.locale} />
          </td>
          <td>
            <div className={listStyles.primary}>{props.location.name}</div>
            <div className={listStyles.secondary}>
              <bdi dir="ltr">{props.location.code}</bdi>
            </div>
          </td>
          <td>
            <StatusBadge tone={taskTone(item.status)}>
              {operationsTaskStatusLabel(item.status, props.locale)}
            </StatusBadge>
          </td>
          <td>
            <bdi dir={props.locale === "ar" ? "rtl" : "ltr"}>
              {formatOperationsTime(
                item.createdAt,
                props.location.timezone,
                props.locale,
              )}
            </bdi>
          </td>
          <td className={styles.actionCell}>
            <DetailAction
              label={`${t.details}: ${operationsTaskTypeLabel(item.taskType, props.locale)}`}
              onClick={() => props.onSelect(item)}
            />
          </td>
        </tr>
      ))}
    </>
  );
}

function StateRow({ text }: { readonly text: string }) {
  return (
    <tr>
      <td className={listStyles.stateCell} colSpan={6}>
        {text}
      </td>
    </tr>
  );
}

function r04NoMatch(locale: "en" | "ar") {
  return locale === "ar"
    ? "لا توجد مهام مطابقة في الصفحة المحمّلة."
    : "No matching tasks on this loaded page.";
}

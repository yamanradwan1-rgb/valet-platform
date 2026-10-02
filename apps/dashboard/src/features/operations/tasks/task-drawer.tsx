import type { ManagementLocation, TaskOverviewEntry } from "@valet/contracts";
import { operationsCopy } from "../operations-copy";
import {
  formatOperationsTime,
  operationsTaskStatusLabel,
  operationsTaskTypeLabel,
} from "../operations-presentation";
import { operationalStaffName } from "../operational-staff";
import { taskTone } from "../operations-labels";
import {
  Fact,
  FactList,
  OperationsDrawer,
  StatusBadge,
} from "../operations-ui";

export function TaskDrawer(props: {
  readonly item: TaskOverviewEntry;
  readonly locale: "en" | "ar";
  readonly location: ManagementLocation;
  readonly onClose: () => void;
}) {
  const t = operationsCopy(props.locale);
  const time = (value: string) =>
    formatOperationsTime(value, props.location.timezone, props.locale);
  return (
    <OperationsDrawer
      label={t.details}
      onClose={props.onClose}
      subtitle={operationsTaskTypeLabel(props.item.taskType, props.locale)}
    >
      <FactList>
        <Fact
          label={t.type}
          value={operationsTaskTypeLabel(props.item.taskType, props.locale)}
        />
        <Fact
          label={t.state}
          value={
            <StatusBadge tone={taskTone(props.item.status)}>
              {operationsTaskStatusLabel(props.item.status, props.locale)}
            </StatusBadge>
          }
        />
        <Fact
          label={t.assignee}
          value={operationalStaffName(props.item.assignee, props.locale)}
        />
        <Fact label={t.location} value={props.location.name} />
        <Fact
          label={t.taskId}
          value={<bdi dir="ltr">{props.item.taskId}</bdi>}
        />
        <Fact
          label={t.sessionId}
          value={<bdi dir="ltr">{props.item.valetSessionId}</bdi>}
        />
        <Fact
          label={props.locale === "ar" ? "البريد الإلكتروني" : "Email"}
          value={
            <bdi dir="ltr">{props.item.assignee?.identity.email ?? "—"}</bdi>
          }
        />
        <Fact
          label={t.created}
          value={
            <bdi dir={props.locale === "ar" ? "rtl" : "ltr"}>
              {time(props.item.createdAt)}
            </bdi>
          }
        />
        <Fact
          label={t.updated}
          value={
            <bdi dir={props.locale === "ar" ? "rtl" : "ltr"}>
              {time(props.item.updatedAt)}
            </bdi>
          }
        />
      </FactList>
    </OperationsDrawer>
  );
}

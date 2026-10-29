import type { ManagementLocation, TaskOverviewEntry } from "@valet/contracts";
import type { ReactNode } from "react";
import { operationsCopy } from "../operations-copy";
import {
  formatOperationsTime,
  operationsTaskStatusLabel,
  operationsTaskTypeLabel,
} from "../operations-presentation";
import { taskAssigneeName, taskCancellerName } from "./task-attribution";
import { emergencyTakeoverCopy } from "./emergency-takeover-copy";
import { taskTone } from "../operations-labels";
import {
  Fact,
  FactList,
  OperationsDrawer,
  StatusBadge,
  styles,
} from "../operations-ui";

export function TaskDrawer(props: {
  readonly help?: ReactNode;
  readonly item: TaskOverviewEntry;
  readonly locale: "en" | "ar";
  readonly location: ManagementLocation;
  readonly onClose: () => void;
  readonly onEmergencyTakeover?: () => void;
}) {
  const t = operationsCopy(props.locale);
  const time = (value: string) =>
    formatOperationsTime(value, props.location.timezone, props.locale);
  return (
    <OperationsDrawer
      help={props.help}
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
          value={taskAssigneeName(props.item, props.locale)}
        />
        {props.item.status === "CANCELLED" ? (
          <Fact
            label={props.locale === "ar" ? "أُلغي بواسطة" : "Cancelled by"}
            value={<bdi>{taskCancellerName(props.item, props.locale)}</bdi>}
          />
        ) : null}
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
      {props.onEmergencyTakeover ? (
        <div className={styles.toolbar}>
          <button
            className={styles.secondary}
            data-testid="emergency-takeover-open"
            onClick={props.onEmergencyTakeover}
            type="button"
          >
            {emergencyTakeoverCopy(props.locale).action}
          </button>
        </div>
      ) : null}
    </OperationsDrawer>
  );
}

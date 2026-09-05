import { Text, View } from "react-native";
import type {
  EmployeeOperationalSession,
  EmployeeOperationalSnapshot,
  StaffTaskQueueItem,
} from "@valet/employee-client";

import { EmployeeButton } from "../employee-ui/employee-controls";
import { EmployeeBadge } from "../employee-ui/employee-feedback";
import { employeeTextStyle } from "../employee-ui/employee-typography";
import type { FoundationLocale } from "../foundation/foundation-locale";
import {
  canAcceptNativeTask,
  nativeTaskActionLabel,
  nativeTaskAge,
  nativeTaskParkingContext,
  nativeTaskStatusLabel,
  nativeTaskTime,
  nativeTaskTypeLabel,
  nativeTaskVehicleLabel,
} from "./native-task-presentation";
import { nativeTaskCardStyles as s } from "./native-task-card-styles";
import type { NativeTasksCopy } from "./native-tasks-copy";

export function NativeTaskCard({
  copy,
  locale,
  operations,
  priority,
  snapshot,
  task,
  textAlign,
}: {
  readonly copy: NativeTasksCopy;
  readonly locale: FoundationLocale;
  readonly operations: EmployeeOperationalSession;
  readonly priority: boolean;
  readonly snapshot: EmployeeOperationalSnapshot;
  readonly task: StaffTaskQueueItem;
  readonly textAlign: "left" | "right";
}) {
  const humanText = employeeTextStyle("human", textAlign);
  const identifierText = employeeTextStyle("identifier", textAlign);
  const assignedToOther =
    task.currentAssigneeMembershipId !== null &&
    task.currentAssigneeMembershipId !== snapshot.scope?.membershipId;
  const retry =
    snapshot.mutation.taskId === task.taskId &&
    snapshot.mutation.phase === "retry-available";
  const busy =
    snapshot.mutation.taskId === task.taskId &&
    (snapshot.mutation.phase === "submitting" ||
      snapshot.mutation.phase === "reconciling");
  const actionLabel = retry ? copy.retry : nativeTaskActionLabel(copy, task);
  const actionable = canAcceptNativeTask(snapshot, task) || retry;
  const showsAction = actionable || busy;
  const parkingContext = nativeTaskParkingContext(task);
  const vehicleLabel = nativeTaskVehicleLabel(task);

  return (
    <View
      accessible={false}
      style={s.card}
      testID={
        priority ? "native-priority-task" : `native-queue-task-${task.taskId}`
      }
    >
      {priority ? <View accessible={false} style={s.accent} /> : null}
      <View style={s.content}>
        {priority ? (
          <Text style={[s.priorityLabel, humanText]}>{copy.priority}</Text>
        ) : null}
        <View style={s.header}>
          <EmployeeBadge
            label={nativeTaskTypeLabel(copy, task.taskType)}
            textAlign={textAlign}
            variant={task.taskType === "RETRIEVAL" ? "danger" : "primary"}
          />
          <View style={s.ageWrap}>
            <Text style={[s.ageLabel, humanText]}>{copy.age}</Text>
            <Text style={[s.age, identifierText]}>{nativeTaskAge(task)}</Text>
          </View>
        </View>
        <Text style={[s.vehicle, humanText]}>{vehicleLabel}</Text>
        {task.vehicle.plateNumberRaw ? (
          <Text style={[s.plate, identifierText]}>
            {task.vehicle.plateNumberRaw}
          </Text>
        ) : null}
        <Text style={[s.detail, humanText]}>
          {nativeTaskTime(copy, locale, task)}
        </Text>
        {task.vehicle.color || parkingContext ? (
          <Text style={[s.detail, humanText]}>
            {[task.vehicle.color, parkingContext].filter(Boolean).join(" · ")}
          </Text>
        ) : null}
        <View style={s.statusRow}>
          <EmployeeBadge
            label={
              assignedToOther
                ? copy.otherStaff
                : nativeTaskStatusLabel(copy, task.status)
            }
            textAlign={textAlign}
            variant={assignedToOther ? "neutral" : "warning"}
          />
          {showsAction && actionLabel ? (
            <EmployeeButton
              busy={busy}
              disabled={busy}
              label={busy ? copy.processing : actionLabel}
              onPress={() => void operations.acceptTask(task.taskId)}
              size="standard"
              variant={priority ? "primary" : "secondary"}
            />
          ) : null}
        </View>
      </View>
    </View>
  );
}

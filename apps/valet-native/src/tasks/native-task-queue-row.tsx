import { Pressable, Text, View } from "react-native";
import type {
  EmployeeOperationalSession,
  EmployeeOperationalSnapshot,
  StaffTaskQueueItem,
} from "@valet/employee-client";

import { EmployeeBadge } from "../employee-ui/employee-feedback";
import { employeeTextStyle } from "../employee-ui/employee-typography";
import type { FoundationLocale } from "../foundation/foundation-locale";
import {
  canAcceptNativeTask,
  canOpenNativeParkingTask,
  nativeTaskActionLabel,
  nativeTaskParkingContext,
  nativeTaskStatusLabel,
  nativeTaskTime,
  nativeTaskTypeLabel,
  nativeTaskVehicleIdentifier,
  nativeTaskVehicleLabel,
} from "./native-task-presentation";
import { nativeTaskQueueRowStyles as s } from "./native-task-queue-row-styles";
import type { NativeTasksCopy } from "./native-tasks-copy";

export function NativeTaskQueueRow({
  copy,
  locale,
  operations,
  onOpenParking = () => undefined,
  snapshot,
  task,
  textAlign,
}: {
  readonly copy: NativeTasksCopy;
  readonly locale: FoundationLocale;
  readonly operations: EmployeeOperationalSession;
  readonly onOpenParking?:
    ((taskId: string, sessionId: string) => void) | undefined;
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
  const opensParking = canOpenNativeParkingTask(snapshot, task);
  const actionable =
    canAcceptNativeTask(snapshot, task) || retry || opensParking;
  const actionLabel = retry ? copy.retry : nativeTaskActionLabel(copy, task);
  const identifier = nativeTaskVehicleIdentifier(task);
  const context =
    nativeTaskParkingContext(task) ?? nativeTaskStatusLabel(copy, task.status);
  const direction = textAlign === "right" ? "rtl" : "ltr";

  return (
    <Pressable
      accessibilityLabel={[
        nativeTaskVehicleLabel(task),
        nativeTaskTypeLabel(copy, task.taskType),
        nativeTaskTime(copy, locale, task),
        context,
        actionable ? actionLabel : undefined,
      ]
        .filter(Boolean)
        .join(". ")}
      accessibilityRole={actionable ? "button" : undefined}
      accessibilityState={{ busy, disabled: !actionable || busy }}
      disabled={!actionable || busy}
      onPress={() =>
        opensParking
          ? onOpenParking(task.taskId, task.sessionId)
          : void operations.acceptTask(task.taskId)
      }
      style={[
        s.row,
        { flexDirection: direction === "rtl" ? "row-reverse" : "row" },
        assignedToOther ? s.assignedToOther : null,
      ]}
      testID={`native-queue-row-${task.taskId}`}
    >
      <View style={s.content}>
        <View
          style={[
            s.badges,
            { flexDirection: direction === "rtl" ? "row-reverse" : "row" },
          ]}
        >
          <EmployeeBadge
            label={nativeTaskTypeLabel(copy, task.taskType)}
            textAlign={textAlign}
            variant={task.taskType === "RETRIEVAL" ? "danger" : "primary"}
          />
          <Text style={[s.time, humanText]}>
            {nativeTaskTime(copy, locale, task)}
          </Text>
          {assignedToOther ? (
            <EmployeeBadge
              label={copy.otherStaff}
              textAlign={textAlign}
              variant="neutral"
            />
          ) : null}
        </View>
        <Text style={[s.vehicle, humanText]}>
          {nativeTaskVehicleLabel(task)}
        </Text>
        <View
          style={[
            s.meta,
            { flexDirection: direction === "rtl" ? "row-reverse" : "row" },
          ]}
        >
          {identifier ? (
            <Text style={[s.detail, identifierText]}>{identifier}</Text>
          ) : null}
          {identifier ? <Text style={[s.detail, humanText]}> · </Text> : null}
          <Text style={[s.detail, humanText]}>{context}</Text>
        </View>
      </View>
      {busy ? (
        <Text style={[s.busy, humanText]}>{copy.processing}</Text>
      ) : actionable ? (
        <Text accessible={false} style={s.chevron}>
          {direction === "rtl" ? "‹" : "›"}
        </Text>
      ) : null}
    </Pressable>
  );
}

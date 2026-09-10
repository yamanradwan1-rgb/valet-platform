import { Pressable, Text, View } from "react-native";
import type {
  EmployeeOperationalSnapshot,
  StaffTaskQueueItem,
} from "@valet/employee-client";

import { EmployeeBadge } from "../employee-ui/employee-feedback";
import { EmployeeChevronRightIcon } from "../employee-ui/employee-icons";
import { employeeTextStyle } from "../employee-ui/employee-typography";
import type { FoundationLocale } from "../foundation/foundation-locale";
import {
  canOpenNativeHandoffOverride,
  nativeTaskActionLabel,
  nativeTaskParkingContext,
  nativeTaskStatusLabel,
  nativeTaskTime,
  nativeTaskTypeLabel,
  nativeTaskVehicleIdentifier,
  nativeTaskVehicleLabel,
} from "./native-task-presentation";
import { nativeTaskQueueRowStyles as s } from "./native-task-queue-row-styles";
import { NativeTaskActionButton } from "./native-task-action-button";
import type { NativeTasksCopy } from "./native-tasks-copy";

export function NativeTaskQueueRow(props: {
  readonly busy: boolean;
  readonly copy: NativeTasksCopy;
  readonly locale: FoundationLocale;
  readonly onAction: () => void;
  readonly onOverrideHandoff: () => void;
  readonly snapshot: EmployeeOperationalSnapshot;
  readonly task: StaffTaskQueueItem;
  readonly textAlign: "left" | "right";
}) {
  const {
    busy,
    copy,
    locale,
    onAction,
    onOverrideHandoff,
    snapshot,
    task,
    textAlign,
  } = props;
  const human = employeeTextStyle("human", textAlign);
  const identifierText = employeeTextStyle("identifier", textAlign);
  const assignedToOther =
    task.currentAssigneeMembershipId !== null &&
    task.currentAssigneeMembershipId !== snapshot.scope?.membershipId;
  const override = canOpenNativeHandoffOverride(snapshot, task);
  const actionable = !assignedToOther;
  const identifier = nativeTaskVehicleIdentifier(task);
  const context =
    nativeTaskParkingContext(task) ?? nativeTaskStatusLabel(copy, task.status);

  const accessibilityLabel = [
    nativeTaskVehicleLabel(task),
    nativeTaskTypeLabel(copy, task.taskType),
    nativeTaskTime(copy, locale, task),
    context,
    actionable ? nativeTaskActionLabel(copy, task) : null,
  ]
    .filter(Boolean)
    .join(". ");
  const rowStyle = [s.row, assignedToOther && s.assignedToOther];
  const content = (
    <>
      <View style={s.content}>
        <View style={s.badges}>
          <EmployeeBadge
            label={nativeTaskTypeLabel(copy, task.taskType)}
            showDot
            textAlign={textAlign}
            variant={task.taskType === "PARKING" ? "warning" : "primary"}
          />
          <Text style={[s.time, human]}>
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
        <Text style={[s.vehicle, human]}>{nativeTaskVehicleLabel(task)}</Text>
        <View style={s.meta}>
          {identifier ? (
            <Text style={[s.detail, identifierText]}>{identifier}</Text>
          ) : null}
          {identifier ? <Text style={[s.detail, human]}> · </Text> : null}
          <Text style={[s.detail, human]}>{context}</Text>
        </View>
      </View>
      {override ? (
        <NativeTaskActionButton
          busy={false}
          disabled={busy}
          label={copy.overrideHandoff}
          onPress={onOverrideHandoff}
          size="compact"
          variant="danger"
        />
      ) : busy ? (
        <Text style={[s.busy, human]}>{copy.processing}</Text>
      ) : actionable ? (
        <EmployeeChevronRightIcon size={16} />
      ) : null}
    </>
  );

  return assignedToOther ? (
    <View style={rowStyle} testID={`native-queue-row-${task.taskId}`}>
      {content}
    </View>
  ) : (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ busy, disabled: busy }}
      disabled={busy}
      onPress={onAction}
      style={rowStyle}
      testID={`native-queue-row-${task.taskId}`}
    >
      {content}
    </Pressable>
  );
}

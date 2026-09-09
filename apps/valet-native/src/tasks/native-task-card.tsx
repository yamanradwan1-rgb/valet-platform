import { Pressable, Text, View } from "react-native";
import type {
  EmployeeOperationalSnapshot,
  StaffTaskQueueItem,
} from "@valet/employee-client";

import { EmployeeBadge } from "../employee-ui/employee-feedback";
import { employeeTextStyle } from "../employee-ui/employee-typography";
import type { FoundationLocale } from "../foundation/foundation-locale";
import {
  canOpenNativeHandoffOverride,
  nativeTaskActionLabel,
  nativeTaskAge,
  nativeTaskStatusLabel,
  nativeTaskTime,
  nativeTaskTypeLabel,
  nativeTaskVehicleLabel,
} from "./native-task-presentation";
import { nativeTaskCardStyles as s } from "./native-task-card-styles";
import { NativeTaskActionButton } from "./native-task-action-button";
import type { NativeTasksCopy } from "./native-tasks-copy";

export function NativeTaskCard({
  busy,
  copy,
  locale,
  onAction,
  onOverrideHandoff,
  snapshot,
  task,
  textAlign,
}: {
  readonly busy: boolean;
  readonly copy: NativeTasksCopy;
  readonly locale: FoundationLocale;
  readonly onAction: () => void;
  readonly onOverrideHandoff: () => void;
  readonly snapshot: EmployeeOperationalSnapshot;
  readonly task: StaffTaskQueueItem;
  readonly textAlign: "left" | "right";
}) {
  const human = employeeTextStyle("human", textAlign);
  const identifier = employeeTextStyle("identifier", textAlign);
  const assignedToOther =
    task.currentAssigneeMembershipId !== null &&
    task.currentAssigneeMembershipId !== snapshot.scope?.membershipId;
  const override = canOpenNativeHandoffOverride(snapshot, task);
  const actionLabel = override
    ? copy.overrideHandoff
    : assignedToOther
      ? copy.statusAssigned
      : nativeTaskActionLabel(copy, task);
  const actionable = !assignedToOther || override;
  const successAction =
    task.status === "ACCEPTED" || task.status === "IN_PROGRESS";

  return (
    <Pressable
      accessibilityRole={actionable ? "button" : undefined}
      accessibilityState={{ busy, disabled: !actionable || busy }}
      disabled={!actionable || busy}
      onPress={override ? onOverrideHandoff : onAction}
      style={[s.card, assignedToOther && s.assignedToOther]}
      testID="native-priority-task"
    >
      <View accessible={false} style={s.accent} />
      <View style={s.content}>
        <View style={s.header}>
          <EmployeeBadge
            label={nativeTaskTypeLabel(copy, task.taskType)}
            showDot
            textAlign={textAlign}
            variant={task.taskType === "PARKING" ? "warning" : "primary"}
          />
          <View style={s.ageWrap}>
            <Text style={[s.ageLabel, human]}>{copy.age}</Text>
            <Text style={[s.age, identifier]}>{nativeTaskAge(task)}</Text>
          </View>
        </View>
        <Text style={[s.vehicle, human]}>{nativeTaskVehicleLabel(task)}</Text>
        <View style={s.vehicleMetaRow}>
          {task.vehicle.plateNumberRaw ? (
            <Text style={[s.vehicleMeta, identifier]}>
              {task.vehicle.plateNumberRaw}
            </Text>
          ) : null}
          {task.vehicle.plateNumberRaw && task.vehicle.color ? (
            <Text style={[s.vehicleMeta, human]}> · </Text>
          ) : null}
          {task.vehicle.color ? (
            <Text style={[s.vehicleMeta, human]}>{task.vehicle.color}</Text>
          ) : null}
        </View>
        <Text style={[s.detail, human]}>
          {nativeTaskTime(copy, locale, task)}
        </Text>
        <View style={s.statusRow}>
          <View>
            <Text style={[s.statusLabel, human]}>{copy.status}</Text>
            <Text style={[s.statusText, human]}>
              {nativeTaskStatusLabel(copy, task.status)}
            </Text>
          </View>
          {actionLabel ? (
            <NativeTaskActionButton
              busy={busy}
              disabled={!actionable || busy}
              label={busy ? copy.processing : actionLabel}
              onPress={override ? onOverrideHandoff : onAction}
              variant={
                override ? "danger" : successAction ? "success" : "primary"
              }
            />
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

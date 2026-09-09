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
  const actionable = !assignedToOther || override;
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
        override ? copy.overrideHandoff : nativeTaskActionLabel(copy, task),
      ]
        .filter(Boolean)
        .join(". ")}
      accessibilityRole={actionable ? "button" : undefined}
      accessibilityState={{ busy, disabled: !actionable || busy }}
      disabled={!actionable || busy}
      onPress={override ? onOverrideHandoff : onAction}
      style={[
        s.row,
        { flexDirection: direction === "rtl" ? "row-reverse" : "row" },
        assignedToOther && s.assignedToOther,
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
        <View
          style={[
            s.meta,
            { flexDirection: direction === "rtl" ? "row-reverse" : "row" },
          ]}
        >
          {identifier ? (
            <Text style={[s.detail, identifierText]}>{identifier}</Text>
          ) : null}
          {identifier ? <Text style={[s.detail, human]}> · </Text> : null}
          <Text style={[s.detail, human]}>{context}</Text>
        </View>
      </View>
      {busy ? (
        <Text style={[s.busy, human]}>{copy.processing}</Text>
      ) : override ? (
        <Text style={[s.busy, human]}>{copy.overrideHandoff}</Text>
      ) : actionable ? (
        <EmployeeChevronRightIcon size={16} />
      ) : null}
    </Pressable>
  );
}

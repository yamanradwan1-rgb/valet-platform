import type { ReactNode } from "react";
import { ScrollView, Text, View } from "react-native";
import type {
  EmployeeOperationalSession,
  EmployeeOperationalSnapshot,
  StaffTaskQueueItem,
} from "@valet/employee-client";

import { styles } from "../foundation/foundation-styles";
import type { FoundationLocale } from "../foundation/foundation-locale";
import {
  canAcceptNativeTask,
  nativeMutationMessage,
  nativeTaskVehicleLabel,
} from "./native-task-presentation";
import { getNativeTasksCopy, type NativeTasksCopy } from "./native-tasks-copy";
import { EmployeeButton } from "../employee-ui/employee-controls";
import { EmployeeCard } from "../employee-ui/employee-feedback";
import { NativeTaskShiftStrip } from "./native-task-shift-strip";

interface NativeTasksPanelProps {
  readonly locale: FoundationLocale;
  readonly operations: EmployeeOperationalSession;
  readonly snapshot: EmployeeOperationalSnapshot;
  readonly textAlign: "left" | "right";
  readonly heading?: string;
  readonly headerAction?: ReactNode;
}

export function NativeTasksPanel({
  locale,
  operations,
  snapshot,
  textAlign,
  heading,
  headerAction,
}: NativeTasksPanelProps) {
  const copy = getNativeTasksCopy(locale);

  if (snapshot.phase === "loading-context" || snapshot.phase === "inactive") {
    return (
      <View style={styles.tasksPanel}>
        <MutationStatus copy={copy} snapshot={snapshot} textAlign={textAlign} />
        <Status copy={copy.loading} textAlign={textAlign} />
      </View>
    );
  }
  if (snapshot.phase === "no-active-shift") {
    return (
      <View style={styles.tasksPanel}>
        <MutationStatus copy={copy} snapshot={snapshot} textAlign={textAlign} />
        <Status copy={copy.noShift} textAlign={textAlign} />
        <TaskButton
          label={copy.refresh}
          onPress={() => void operations.refresh()}
        />
      </View>
    );
  }
  if (snapshot.phase === "ambiguous-active-shifts") {
    return (
      <View style={styles.tasksPanel}>
        <MutationStatus copy={copy} snapshot={snapshot} textAlign={textAlign} />
        <Status copy={copy.ambiguousShifts} textAlign={textAlign} />
        <TaskButton
          label={copy.refresh}
          onPress={() => void operations.refresh()}
        />
      </View>
    );
  }
  if (snapshot.phase === "error" || snapshot.scope === null) {
    return (
      <View style={styles.tasksPanel}>
        <MutationStatus copy={copy} snapshot={snapshot} textAlign={textAlign} />
        <Status copy={copy.error} textAlign={textAlign} />
        <TaskButton
          label={copy.refresh}
          onPress={() => void operations.refresh()}
        />
      </View>
    );
  }
  return (
    <View style={styles.tasksPanel}>
      <NativeTaskShiftStrip
        activeLabel={copy.activeShift}
        scope={snapshot.scope}
        textAlign={textAlign}
      />
      <View style={styles.taskHeader}>
        <Text
          accessibilityRole="header"
          style={[styles.taskHeading, { textAlign }]}
        >
          {heading ?? copy.tasks}
        </Text>
        <View style={styles.taskHeaderActions}>
          {headerAction}
          <TaskButton
            disabled={snapshot.queueLoading}
            label={copy.refresh}
            onPress={() => void operations.refreshQueue()}
          />
        </View>
      </View>
      {snapshot.queueFailure ? (
        <Status copy={copy.error} textAlign={textAlign} />
      ) : null}
      <MutationStatus copy={copy} snapshot={snapshot} textAlign={textAlign} />
      <ScrollView contentContainerStyle={styles.taskList}>
        {snapshot.tasks.length === 0 && !snapshot.queueLoading ? (
          <Status copy={copy.empty} textAlign={textAlign} />
        ) : null}
        {snapshot.tasks.map((task) => (
          <TaskCard
            copy={copy}
            key={task.taskId}
            onAccept={() => void operations.acceptTask(task.taskId)}
            snapshot={snapshot}
            task={task}
            textAlign={textAlign}
          />
        ))}
      </ScrollView>
    </View>
  );
}

function TaskCard({
  copy,
  onAccept,
  snapshot,
  task,
  textAlign,
}: {
  readonly copy: NativeTasksCopy;
  readonly onAccept: () => void;
  readonly snapshot: EmployeeOperationalSnapshot;
  readonly task: StaffTaskQueueItem;
  readonly textAlign: "left" | "right";
}) {
  const actionable = canAcceptNativeTask(snapshot, task);
  const retry =
    snapshot.mutation.taskId === task.taskId &&
    snapshot.mutation.phase === "retry-available";
  const busy =
    snapshot.mutation.taskId === task.taskId &&
    snapshot.mutation.phase === "submitting";
  return (
    <EmployeeCard accessibilityLabel={nativeTaskVehicleLabel(task)}>
      <Text style={[styles.taskTitle, { textAlign }]}>
        {nativeTaskVehicleLabel(task)}
      </Text>
      <Text style={[styles.taskMeta, { textAlign }]}>
        {copy.status}: {task.status}
      </Text>
      <Text style={[styles.taskMeta, { textAlign }]}>
        {copy.version}: {task.version}
      </Text>
      {actionable || retry ? (
        <TaskButton
          disabled={busy}
          label={busy ? copy.processing : retry ? copy.retry : copy.accept}
          onPress={onAccept}
        />
      ) : null}
    </EmployeeCard>
  );
}

function MutationStatus({
  copy,
  snapshot,
  textAlign,
}: {
  readonly copy: NativeTasksCopy;
  readonly snapshot: EmployeeOperationalSnapshot;
  readonly textAlign: "left" | "right";
}) {
  const message = nativeMutationMessage(copy, snapshot.mutation.phase);
  return message ? <Status copy={message} textAlign={textAlign} /> : null;
}

function Status({
  copy,
  textAlign,
}: {
  readonly copy: string;
  readonly textAlign: "left" | "right";
}) {
  return (
    <Text
      accessibilityLiveRegion="polite"
      style={[styles.taskStatus, { textAlign }]}
    >
      {copy}
    </Text>
  );
}

function TaskButton({
  disabled = false,
  label,
  onPress,
}: {
  readonly disabled?: boolean;
  readonly label: string;
  readonly onPress: () => void;
}) {
  return (
    <EmployeeButton
      disabled={disabled}
      label={label}
      onPress={onPress}
      size="compact"
      variant="ghost"
    />
  );
}

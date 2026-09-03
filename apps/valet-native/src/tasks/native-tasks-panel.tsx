import { useEffect } from "react";
import { AppState, Pressable, ScrollView, Text, View } from "react-native";
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
  nativeOperationalFacts,
  nativeTaskVehicleLabel,
} from "./native-task-presentation";
import { getNativeTasksCopy, type NativeTasksCopy } from "./native-tasks-copy";

interface NativeTasksPanelProps {
  readonly locale: FoundationLocale;
  readonly operations: EmployeeOperationalSession;
  readonly snapshot: EmployeeOperationalSnapshot;
  readonly textAlign: "left" | "right";
}

export function NativeTasksPanel({
  locale,
  operations,
  snapshot,
  textAlign,
}: NativeTasksPanelProps) {
  const copy = getNativeTasksCopy(locale);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void operations.refresh();
    });
    return () => subscription.remove();
  }, [operations]);

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
  const facts = nativeOperationalFacts(snapshot.scope);

  return (
    <View style={styles.tasksPanel}>
      <View style={styles.contextCard}>
        <Fact
          label={copy.organization}
          value={facts.organization}
          textAlign={textAlign}
        />
        <Fact
          label={copy.location}
          value={facts.location}
          textAlign={textAlign}
        />
        <Fact label={copy.role} value={facts.role} textAlign={textAlign} />
        <Fact label={copy.shift} value={facts.shift} textAlign={textAlign} />
      </View>
      <View style={styles.taskHeader}>
        <Text accessibilityRole="header" style={styles.taskHeading}>
          {copy.tasks}
        </Text>
        <TaskButton
          disabled={snapshot.queueLoading}
          label={copy.refresh}
          onPress={() => void operations.refreshQueue()}
        />
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
    <View
      accessibilityLabel={nativeTaskVehicleLabel(task)}
      style={styles.taskCard}
    >
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
    </View>
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

function Fact({
  label,
  value,
  textAlign,
}: {
  readonly label: string;
  readonly value: string;
  readonly textAlign: "left" | "right";
}) {
  return (
    <Text style={[styles.contextFact, { textAlign }]}>
      {label}: {value}
    </Text>
  );
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
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.smallActionButton, disabled && styles.disabledButton]}
    >
      <Text style={styles.smallActionLabel}>{label}</Text>
    </Pressable>
  );
}

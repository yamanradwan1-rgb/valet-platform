import type { ReactNode } from "react";
import { FlatList, Text, View } from "react-native";
import type {
  EmployeeOperationalSession,
  EmployeeOperationalSnapshot,
} from "@valet/employee-client";

import { styles } from "../foundation/foundation-styles";
import type { FoundationLocale } from "../foundation/foundation-locale";
import {
  nativeMutationMessage,
  nativeQueueFailureMessage,
} from "./native-task-presentation";
import { getNativeTasksCopy, type NativeTasksCopy } from "./native-tasks-copy";
import { EmployeeButton } from "../employee-ui/employee-controls";
import {
  EmployeeError,
  EmployeeStatus,
} from "../employee-ui/employee-feedback";
import { NativeTaskCard } from "./native-task-card";
import { NativeTaskQueueRow } from "./native-task-queue-row";
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
  const unavailable = statusForUnavailablePhase(snapshot, copy);

  if (unavailable !== null || snapshot.scope === null) {
    return (
      <View style={styles.tasksPanel}>
        <MutationStatus copy={copy} snapshot={snapshot} textAlign={textAlign} />
        <EmployeeStatus textAlign={textAlign}>
          {unavailable ?? copy.error}
        </EmployeeStatus>
        {snapshot.phase !== "inactive" &&
        snapshot.phase !== "loading-context" ? (
          <EmployeeButton
            label={copy.refresh}
            onPress={() => void operations.refresh()}
            size="standard"
            variant="secondary"
          />
        ) : null}
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
          <EmployeeButton
            busy={snapshot.queueRefreshing}
            disabled={snapshot.queueLoading || snapshot.queueRefreshing}
            label={copy.refresh}
            onPress={() => void operations.refreshQueue()}
            size="standard"
            variant="ghost"
          />
        </View>
      </View>
      {snapshot.queueFailure ? (
        <EmployeeError textAlign={textAlign}>
          {nativeQueueFailureMessage(
            copy,
            snapshot.queueFailure,
            snapshot.queueHardStopped,
            snapshot.tasks.length > 0,
          )}
        </EmployeeError>
      ) : null}
      <MutationStatus copy={copy} snapshot={snapshot} textAlign={textAlign} />
      <FlatList
        contentContainerStyle={styles.taskList}
        data={snapshot.tasks}
        initialNumToRender={8}
        keyExtractor={(task) => task.taskId}
        ListEmptyComponent={
          !snapshot.queueLoading ? (
            <EmployeeStatus textAlign={textAlign}>{copy.empty}</EmployeeStatus>
          ) : null
        }
        maxToRenderPerBatch={8}
        renderItem={({ item, index }) =>
          index === 0 ? (
            <NativeTaskCard
              copy={copy}
              locale={locale}
              operations={operations}
              priority
              snapshot={snapshot}
              task={item}
              textAlign={textAlign}
            />
          ) : (
            <NativeTaskQueueRow
              copy={copy}
              locale={locale}
              operations={operations}
              snapshot={snapshot}
              task={item}
              textAlign={textAlign}
            />
          )
        }
        testID="native-production-task-queue"
        windowSize={7}
      />
    </View>
  );
}

function statusForUnavailablePhase(
  snapshot: EmployeeOperationalSnapshot,
  copy: NativeTasksCopy,
): string | null {
  if (snapshot.queueHardStopped) return copy.accessChanged;
  if (
    snapshot.phase === "inactive" ||
    (snapshot.phase === "loading-context" && snapshot.tasks.length === 0)
  ) {
    return copy.loading;
  }
  if (snapshot.phase === "no-active-shift") return copy.noShift;
  if (snapshot.phase === "ambiguous-active-shifts") return copy.ambiguousShifts;
  if (
    snapshot.phase !== "ready" &&
    !(snapshot.phase === "loading-context" && snapshot.tasks.length > 0)
  ) {
    return copy.error;
  }
  if (snapshot.queueLoading && snapshot.tasks.length === 0) return copy.loading;
  return null;
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
  return message ? (
    <EmployeeStatus textAlign={textAlign}>{message}</EmployeeStatus>
  ) : null;
}

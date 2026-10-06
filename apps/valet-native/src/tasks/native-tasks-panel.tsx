import { createEmployeeStyles } from "../appearance/employee-themed-styles";
import { useEmployeeStyles } from "../appearance/employee-appearance-context";
import { useRef, useState, type ReactNode } from "react";
import { FlatList, Text, View } from "react-native";
import type {
  EmployeeOperationalSession,
  EmployeeOperationalSnapshot,
  StaffTaskQueueItem,
} from "@valet/employee-client";

import {
  EmployeeError,
  EmployeeStatus,
} from "../employee-ui/employee-feedback";

import {
  employeeTextStyle,
  employeeTypography as type,
} from "../employee-ui/employee-typography";
import type { FoundationLocale } from "../foundation/foundation-locale";
import { getNativeTasksCopy, type NativeTasksCopy } from "./native-tasks-copy";
import { NativeTaskCard } from "./native-task-card";
import { NativeTaskQueueRow } from "./native-task-queue-row";
import { NativeTaskShiftStrip } from "./native-task-shift-strip";

export function NativeTasksPanel(props: {
  readonly headerAction?: ReactNode;
  readonly heading?: string;
  readonly locale: FoundationLocale;
  readonly onOverrideHandoff?: (task: StaffTaskQueueItem) => void;
  readonly onTaskAction?: (task: StaffTaskQueueItem) => Promise<boolean>;
  readonly operations: EmployeeOperationalSession;
  readonly snapshot: EmployeeOperationalSnapshot;
  readonly textAlign: "left" | "right";
}) {
  const screen = useEmployeeStyles(screenTheme);

  const {
    headerAction,
    heading,
    locale,
    onOverrideHandoff = () => undefined,
    onTaskAction,
    operations,
    snapshot,
    textAlign,
  } = props;
  const handleTaskAction =
    onTaskAction ??
    (async (task: StaffTaskQueueItem) => {
      await operations.acceptTask(task.taskId);
      return true;
    });
  const copy = getNativeTasksCopy(locale);
  const inFlight = useRef(false);
  const [inFlightTaskId, setInFlightTaskId] = useState<string | null>(null);
  const [actionError, setActionError] = useState(false);
  const unavailable = statusForUnavailablePhase(snapshot, copy);

  if (unavailable !== null || snapshot.scope === null) {
    return (
      <View style={screen.main}>
        <EmployeeStatus textAlign={textAlign}>
          {unavailable ?? copy.error}
        </EmployeeStatus>
      </View>
    );
  }

  const run = async (task: StaffTaskQueueItem) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setInFlightTaskId(task.taskId);
    setActionError(false);
    try {
      setActionError(!(await handleTaskAction(task)));
    } catch {
      setActionError(true);
    } finally {
      inFlight.current = false;
      setInFlightTaskId(null);
    }
  };

  const runOverride = (task: StaffTaskQueueItem) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setInFlightTaskId(task.taskId);
    try {
      onOverrideHandoff(task);
    } finally {
      inFlight.current = false;
      setInFlightTaskId(null);
    }
  };

  const priority = snapshot.tasks[0] ?? null;
  return (
    <View style={screen.root}>
      <NativeTaskShiftStrip
        activeLabel={copy.activeShift}
        locale={locale}
        scope={snapshot.scope}
        textAlign={textAlign}
      />
      <View style={screen.main}>
        <View style={screen.header}>
          <Text
            accessibilityRole="header"
            style={[screen.heading, { textAlign }]}
          >
            {heading ?? copy.tasks}
          </Text>
          {headerAction}
        </View>
        {actionError ? (
          <EmployeeError textAlign={textAlign}>
            {copy.actionFailed}
          </EmployeeError>
        ) : null}
        {priority ? (
          <NativeTaskCard
            busy={inFlightTaskId === priority.taskId}
            copy={copy}
            locale={locale}
            onAction={() => void run(priority)}
            onOverrideHandoff={() => runOverride(priority)}
            snapshot={snapshot}
            task={priority}
            textAlign={textAlign}
          />
        ) : null}
        <Text
          style={[screen.queueLabel, employeeTextStyle("human", textAlign)]}
        >
          {copy.queue}
        </Text>
        <FlatList
          contentContainerStyle={screen.list}
          data={snapshot.tasks.slice(1)}
          initialNumToRender={8}
          keyExtractor={(task) => task.taskId}
          ListEmptyComponent={
            !snapshot.queueLoading && priority === null ? (
              <EmployeeStatus textAlign={textAlign}>
                {copy.empty}
              </EmployeeStatus>
            ) : null
          }
          maxToRenderPerBatch={8}
          renderItem={({ item }) => (
            <NativeTaskQueueRow
              busy={inFlightTaskId === item.taskId}
              copy={copy}
              locale={locale}
              onAction={() => void run(item)}
              onOverrideHandoff={() => runOverride(item)}
              snapshot={snapshot}
              task={item}
              textAlign={textAlign}
            />
          )}
          testID="native-production-task-queue"
          windowSize={7}
        />
      </View>
    </View>
  );
}

const screenTheme = createEmployeeStyles((p) => ({
  root: { flex: 1, minHeight: 0 },
  main: {
    flex: 1,
    gap: 20,
    minHeight: 0,
    paddingHorizontal: 20,
    paddingVertical: 20,
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  heading: { ...type.pageTitleLarge, color: p.textPrimary },
  queueLabel: {
    ...type.badge,
    color: p.textMuted,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  list: { gap: 8, paddingBottom: 8 },
}));

function statusForUnavailablePhase(
  snapshot: EmployeeOperationalSnapshot,
  copy: NativeTasksCopy,
) {
  if (snapshot.queueHardStopped) return copy.accessChanged;
  if (
    snapshot.phase === "inactive" ||
    (snapshot.phase === "loading-context" && snapshot.tasks.length === 0)
  )
    return copy.loading;
  if (snapshot.phase === "no-active-shift") return copy.noShift;
  if (snapshot.phase === "ambiguous-active-shifts") return copy.ambiguousShifts;
  if (
    snapshot.phase !== "ready" &&
    !(snapshot.phase === "loading-context" && snapshot.tasks.length > 0)
  )
    return copy.error;
  if (
    snapshot.tasks.length === 0 &&
    snapshot.successfulQueueSnapshotCount === 0
  )
    return copy.loading;
  if (snapshot.queueLoading && snapshot.tasks.length === 0) return copy.loading;
  return null;
}

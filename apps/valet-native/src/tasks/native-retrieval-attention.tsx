import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import {
  EmployeeRetrievalAttentionTracker,
  type EmployeeOperationalSession,
  type EmployeeOperationalSnapshot,
} from "@valet/employee-client";

import type { FoundationLocale } from "../foundation/foundation-locale";
import {
  employeeColors as c,
  employeeMinimumTouchTarget,
  employeeRadius,
  employeeSpacing as space,
} from "../employee-ui/employee-tokens";
import {
  employeeTextStyle,
  employeeTypography as type,
} from "../employee-ui/employee-typography";
import { getNativeTasksCopy } from "./native-tasks-copy";

export function NativeRetrievalAttention({
  locale,
  onOpenQueue,
  operations,
  snapshot,
  textAlign,
}: {
  readonly locale: FoundationLocale;
  readonly onOpenQueue: () => void;
  readonly operations: EmployeeOperationalSession;
  readonly snapshot: EmployeeOperationalSnapshot;
  readonly textAlign: "left" | "right";
}) {
  const [taskIds, setTaskIds] = useState<readonly string[]>([]);
  const [opening, setOpening] = useState(false);
  const tracker = useRef(new EmployeeRetrievalAttentionTracker());
  const copy = getNativeTasksCopy(locale);
  const humanText = employeeTextStyle("human", textAlign);

  useEffect(() => {
    const result = tracker.current.observe(snapshot);
    if (result.scopeChanged) {
      setTaskIds(result.newTaskIds);
    } else if (result.newTaskIds.length > 0) {
      setTaskIds((current) => [
        ...current,
        ...result.newTaskIds.filter((id) => !current.includes(id)),
      ]);
    }
  }, [snapshot]);

  if (taskIds.length === 0) return null;
  const taskId = taskIds[0]!;

  return (
    <View
      accessible={false}
      accessibilityLiveRegion="assertive"
      style={attentionStyles.container}
      testID="native-retrieval-attention"
    >
      <Pressable
        accessibilityLabel={`${copy.retrievalAlertTitle}. ${copy.retrievalAlertBody}`}
        accessibilityRole="button"
        accessibilityState={{ busy: opening, disabled: opening }}
        disabled={opening}
        onPress={() => {
          setOpening(true);
          void operations.refreshQueue().finally(() => {
            setTaskIds((current) => current.filter((id) => id !== taskId));
            setOpening(false);
            onOpenQueue();
          });
        }}
        style={attentionStyles.message}
      >
        <Text
          accessibilityLiveRegion="assertive"
          style={[attentionStyles.title, humanText]}
        >
          {copy.retrievalAlertTitle}
        </Text>
        <Text style={[attentionStyles.body, humanText]}>
          {copy.retrievalAlertBody}
        </Text>
      </Pressable>
      <Pressable
        accessibilityLabel={copy.dismiss}
        accessibilityRole="button"
        hitSlop={8}
        onPress={() =>
          setTaskIds((current) => current.filter((id) => id !== taskId))
        }
        style={attentionStyles.dismiss}
      >
        <Text style={attentionStyles.dismissLabel}>{copy.dismiss}</Text>
      </Pressable>
    </View>
  );
}

const attentionStyles = StyleSheet.create({
  body: { ...type.small, color: c.neutral },
  container: {
    alignItems: "center",
    backgroundColor: c.white,
    borderColor: c.blue,
    borderRadius: employeeRadius.primary,
    borderWidth: 1,
    elevation: 6,
    flexDirection: "row",
    gap: space.sm,
    left: space.screen,
    padding: space.sm,
    position: "absolute",
    right: space.screen,
    shadowColor: c.navy,
    shadowOffset: { height: 3, width: 0 },
    shadowOpacity: 0.16,
    shadowRadius: 8,
    top: space.sm,
    zIndex: 20,
  },
  dismiss: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: employeeMinimumTouchTarget,
    paddingHorizontal: space.sm,
  },
  dismissLabel: { ...type.small, color: c.blue, fontWeight: "600" },
  message: { flex: 1, gap: 2, minHeight: employeeMinimumTouchTarget },
  title: { ...type.body, color: c.navy, fontWeight: "700" },
});

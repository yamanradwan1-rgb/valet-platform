import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { type EmployeeOperationalSession } from "@valet/employee-client";

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
  onDismiss,
  onOpenQueue,
  operations,
  taskIds,
  textAlign,
}: {
  readonly locale: FoundationLocale;
  readonly onDismiss: (taskId: string) => void;
  readonly onOpenQueue: () => void;
  readonly operations: EmployeeOperationalSession;
  readonly taskIds: readonly string[];
  readonly textAlign: "left" | "right";
}) {
  const [opening, setOpening] = useState(false);
  const copy = getNativeTasksCopy(locale);
  const humanText = employeeTextStyle("human", textAlign);

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
            onDismiss(taskId);
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
        onPress={() => onDismiss(taskId)}
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

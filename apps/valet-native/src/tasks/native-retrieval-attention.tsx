import { useCallback, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { type EmployeeOperationalSession } from "@valet/employee-client";

import type { FoundationLocale } from "../foundation/foundation-locale";
import {
  employeeColors as c,
  employeeRadius,
  employeeSpacing as space,
} from "../employee-ui/employee-tokens";
import {
  employeeFontFamilies,
  employeeTextStyle,
  employeeTypography as type,
} from "../employee-ui/employee-typography";
import { nativeRetrievalAlertGesture } from "../retrieval-alert/native-retrieval-alert-gesture";
import { getNativeTasksCopy } from "./native-tasks-copy";

interface NativeRetrievalAlertProps {
  readonly locale: FoundationLocale;
  readonly onDismiss: (taskId: string) => void;
  readonly onOpenQueue: () => void;
  readonly operations: EmployeeOperationalSession;
  readonly taskIds: readonly string[];
  readonly textAlign: "left" | "right";
}

export function NativeRetrievalAttention(props: NativeRetrievalAlertProps) {
  if (props.taskIds.length === 0) return null;
  return (
    <View
      accessibilityLiveRegion="polite"
      accessibilityRole="summary"
      style={[
        attentionStyles.stack,
        { direction: props.locale === "ar" ? "rtl" : "ltr" },
      ]}
      testID="native-retrieval-attention"
    >
      {props.taskIds.map((taskId) => (
        <NativeRetrievalAlertBanner key={taskId} {...props} taskId={taskId} />
      ))}
    </View>
  );
}

export function NativeRetrievalAlertBanner({
  locale,
  onDismiss,
  onOpenQueue,
  operations,
  taskId,
  textAlign,
}: Omit<NativeRetrievalAlertProps, "taskIds"> & { readonly taskId: string }) {
  const [opening, setOpening] = useState(false);
  const openingRef = useRef(false);
  const translateY = useSharedValue(0);
  const opacity = useSharedValue(1);
  const suppressOpen = useSharedValue(0);
  const copy = getNativeTasksCopy(locale);
  const humanText = employeeTextStyle("human", textAlign);
  const dismiss = useCallback(() => onDismiss(taskId), [onDismiss, taskId]);
  const pan = Gesture.Pan()
    .onUpdate((event) => {
      const state = nativeRetrievalAlertGesture(
        event.translationX,
        event.translationY,
      );
      translateY.value = state.offsetY;
      opacity.value = state.opacity;
      if (state.suppressOpen) suppressOpen.value = 1;
    })
    .onEnd((event) => {
      const state = nativeRetrievalAlertGesture(
        event.translationX,
        event.translationY,
      );
      if (state.dismiss) scheduleOnRN(dismiss);
      else {
        translateY.value = withTiming(0, {
          duration: 150,
          reduceMotion: ReduceMotion.System,
        });
        opacity.value = withTiming(1, {
          duration: 150,
          reduceMotion: ReduceMotion.System,
        });
      }
      suppressOpen.value = withDelay(120, withTiming(0, { duration: 0 }));
    })
    .onFinalize((_event, success) => {
      if (success) return;
      translateY.value = withTiming(0, {
        duration: 150,
        reduceMotion: ReduceMotion.System,
      });
      opacity.value = withTiming(1, {
        duration: 150,
        reduceMotion: ReduceMotion.System,
      });
      suppressOpen.value = withDelay(120, withTiming(0, { duration: 0 }));
    });
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <GestureDetector gesture={pan}>
      <Animated.View
        style={[
          attentionStyles.banner,
          { flexDirection: textAlign === "right" ? "row-reverse" : "row" },
          animatedStyle,
        ]}
        testID={`native-retrieval-alert-${taskId}`}
      >
        <Pressable
          accessibilityLabel={`${copy.retrievalAlertTitle}. ${copy.retrievalAlertBody}`}
          accessibilityRole="button"
          accessibilityState={{ busy: opening, disabled: opening }}
          disabled={opening}
          onPress={() => {
            if (suppressOpen.value === 1 || openingRef.current) return;
            openingRef.current = true;
            setOpening(true);
            onDismiss(taskId);
            onOpenQueue();
            void operations.refreshQueue();
          }}
          style={attentionStyles.message}
        >
          <Text style={[attentionStyles.title, humanText]}>
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
          <Text style={[attentionStyles.dismissLabel, humanText]}>
            {copy.dismiss}
          </Text>
        </Pressable>
      </Animated.View>
    </GestureDetector>
  );
}

export const nativeRetrievalAttentionStyles = StyleSheet.create({
  banner: {
    alignItems: "center",
    backgroundColor: c.white,
    borderColor: "#176BFF40",
    borderRadius: employeeRadius.primary,
    borderWidth: 1,
    elevation: 10,
    shadowColor: c.navy,
    shadowOffset: { height: 6, width: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    width: "100%",
  },
  body: { ...type.small, color: c.neutral, marginTop: 2 },
  dismiss: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: space.md,
  },
  dismissLabel: { ...type.small, color: c.blue, fontWeight: "600" },
  message: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  stack: {
    gap: space.sm,
    left: space.lg,
    position: "absolute",
    right: space.lg,
    top: 80,
    zIndex: 30,
  },
  title: {
    ...type.body,
    color: c.navy,
    fontFamily: employeeFontFamilies.display,
    fontWeight: "700",
  },
});

const attentionStyles = nativeRetrievalAttentionStyles;

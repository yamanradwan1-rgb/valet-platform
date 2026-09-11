import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import type { EmployeeLocale } from "@valet/employee-client";

import {
  employeeColors as c,
  employeeSpacing as space,
} from "../employee-ui/employee-tokens";
import {
  employeeTextStyle,
  employeeTypography as type,
} from "../employee-ui/employee-typography";
import { getNativePushCopy } from "./native-push-copy";
import type { NativePushSnapshot } from "./native-push-types";

export function NativePushPermissionStatus(props: {
  readonly locale: EmployeeLocale;
  readonly onRequestPermission: () => Promise<void>;
  readonly snapshot: NativePushSnapshot;
  readonly textAlign: "left" | "right";
}) {
  const copy = getNativePushCopy(props.locale);
  const requestable =
    props.snapshot.permission === "undetermined" ||
    props.snapshot.permission === "denied";
  const blocked = props.snapshot.permission === "blocked";
  const channelUnavailable =
    props.snapshot.permission === "granted" &&
    props.snapshot.registration === "confirmed" &&
    !props.snapshot.channelAvailable;
  const settingsRequired = blocked || channelUnavailable;
  const confirmed =
    props.snapshot.permission === "granted" &&
    props.snapshot.registration === "confirmed" &&
    props.snapshot.channelAvailable;
  const message = confirmed
    ? copy.confirmed
    : channelUnavailable
      ? copy.channelUnavailable
      : props.snapshot.permission === "granted"
        ? copy.pending
        : requestable
          ? copy.requestable
          : blocked
            ? copy.blocked
            : copy.unavailable;

  return (
    <View
      accessibilityLiveRegion="polite"
      style={styles.container}
      testID="native-push-permission-status"
    >
      <Text
        style={[styles.message, employeeTextStyle("human", props.textAlign)]}
      >
        {message}
      </Text>
      {requestable || settingsRequired ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            if (requestable) void props.onRequestPermission();
            else void Linking.openSettings();
          }}
          style={styles.action}
        >
          <Text style={styles.actionText}>
            {requestable ? copy.enable : copy.openSettings}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  action: {
    alignItems: "center",
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: space.md,
  },
  actionText: { ...type.small, color: c.blue, fontWeight: "700" },
  container: {
    alignItems: "center",
    backgroundColor: c.white,
    borderBottomColor: c.border,
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: space.sm,
    paddingHorizontal: space.lg,
  },
  message: {
    ...type.small,
    color: c.neutral,
    flex: 1,
    paddingVertical: space.sm,
  },
});

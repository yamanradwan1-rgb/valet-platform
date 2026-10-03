import { createEmployeeStyles } from "../appearance/employee-themed-styles";
import { useEmployeeStyles } from "../appearance/employee-appearance-context";
import { Linking, Pressable, Text, View } from "react-native";
import type { EmployeeLocale } from "@valet/employee-client";

import { employeeSpacing as space } from "../employee-ui/employee-tokens";
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
  const styles = useEmployeeStyles(stylesTheme);

  const copy = getNativePushCopy(props.locale);
  const presentation = nativePushStatusPresentation(props.snapshot, copy);

  return (
    <View
      accessibilityLiveRegion="polite"
      style={styles.container}
      testID="native-push-permission-status"
    >
      <Text
        style={[styles.message, employeeTextStyle("human", props.textAlign)]}
      >
        {presentation.message}
      </Text>
      {presentation.action === null ? null : (
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            if (presentation.action === "request")
              void props.onRequestPermission();
            else void Linking.openSettings();
          }}
          style={styles.action}
        >
          <Text style={styles.actionText}>
            {presentation.action === "request"
              ? copy.enable
              : copy.openSettings}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

export function nativePushStatusPresentation(
  snapshot: NativePushSnapshot,
  copy: ReturnType<typeof getNativePushCopy>,
) {
  const requestable =
    snapshot.permission === "undetermined" || snapshot.permission === "denied";
  const blocked = snapshot.permission === "blocked";
  const channelUnavailable =
    snapshot.permission === "granted" &&
    snapshot.registration === "confirmed" &&
    !snapshot.channelAvailable;
  const settingsRequired = blocked || channelUnavailable;
  const confirmed =
    snapshot.permission === "granted" &&
    snapshot.registration === "confirmed" &&
    snapshot.channelAvailable;
  const message = confirmed
    ? copy.confirmed
    : channelUnavailable
      ? copy.channelUnavailable
      : snapshot.permission === "granted"
        ? snapshot.registration === "network-unavailable"
          ? copy.networkUnavailable
          : snapshot.registration === "registration-error"
            ? copy.registrationError
            : snapshot.registration === "token-unavailable"
              ? copy.tokenUnavailable
              : copy.pending
        : requestable
          ? copy.requestable
          : blocked
            ? copy.blocked
            : copy.unavailable;

  return {
    action: requestable
      ? ("request" as const)
      : settingsRequired
        ? ("settings" as const)
        : null,
    confirmed,
    message,
  };
}

const stylesTheme = createEmployeeStyles((p) => ({
  action: {
    alignItems: "center",
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: space.md,
  },
  actionText: { ...type.small, color: p.linkPrimary, fontWeight: "700" },
  container: {
    alignItems: "center",
    backgroundColor: p.selectedSurface,
    borderRadius: 12,
    flexDirection: "row",
    gap: space.sm,
    paddingHorizontal: space.md,
  },
  message: {
    ...type.small,
    color: p.textSecondary,
    flex: 1,
    paddingVertical: space.sm,
  },
}));

import { useState, type ReactNode } from "react";
import type {
  EmployeeLocale,
  EmployeeOperationalScope,
} from "@valet/employee-client";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { employeeTextStyle } from "../employee-ui/employee-typography";
import { EmployeeSettingsIcon } from "../employee-ui/employee-icons";
import { employeeColors } from "../employee-ui/employee-tokens";
import { NativePushPermissionStatus } from "../notifications/native-push-permission-status";
import type { NativePushSnapshot } from "../notifications/native-push-types";
import { getNativeTelemetry } from "../telemetry/native-telemetry-owner";
import { nativeSupportDiagnosticsView } from "../telemetry/native-support-diagnostics";
import { nativeAccountMenuCopy } from "./native-account-menu-copy";
import {
  nativeAccountAvatarStyles,
  nativeAccountMenuStyles as styles,
} from "./native-account-menu-styles";

export function NativeAccountMenu({
  locale,
  onRequestNotificationPermission,
  onSelectLocale,
  pushSnapshot,
  scope,
}: {
  readonly locale: EmployeeLocale;
  readonly onRequestNotificationPermission: () => Promise<void>;
  readonly onSelectLocale: (locale: EmployeeLocale) => void;
  readonly pushSnapshot: NativePushSnapshot;
  readonly scope: EmployeeOperationalScope;
}) {
  const [open, setOpen] = useState(false);
  const copy = nativeAccountMenuCopy[locale];
  const textAlign = locale === "ar" ? "right" : "left";
  const direction = locale === "ar" ? "rtl" : "ltr";
  const notificationState =
    pushSnapshot.permission === "granted" &&
    pushSnapshot.registration === "confirmed" &&
    pushSnapshot.channelAvailable
      ? copy.enabled
      : pushSnapshot.permission === "granted"
        ? copy.notConfirmed
        : copy.disabled;
  const diagnostics = nativeSupportDiagnosticsView(
    getNativeTelemetry().snapshot(),
    0,
  );
  const buildValue = (label: "appBuild" | "appVersion") =>
    diagnostics.buildRows.find((row) => row.label === label)?.value ?? "—";
  const role =
    scope.role === "VALET_SUPERVISOR" ? copy.roleSupervisor : copy.roleEmployee;

  return (
    <>
      <Pressable
        accessibilityLabel={copy.title}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        hitSlop={6}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [
          nativeAccountAvatarStyles.avatar,
          pressed && nativeAccountAvatarStyles.avatarPressed,
        ]}
        testID="native-role-avatar"
      >
        <EmployeeSettingsIcon color={employeeColors.white} size={20} />
      </Pressable>
      <Modal
        animationType="fade"
        onRequestClose={() => setOpen(false)}
        statusBarTranslucent
        transparent
        visible={open}
      >
        <View style={styles.overlay}>
          <Pressable
            accessibilityLabel={copy.close}
            accessibilityRole="button"
            onPress={() => setOpen(false)}
            style={StyleSheet.absoluteFill}
            testID="native-account-menu-backdrop"
          />
          <View
            accessibilityViewIsModal
            style={[styles.sheet, { direction }]}
            testID="native-account-menu"
          >
            <View style={styles.handle} />
            <View style={styles.headingRow}>
              <Text
                accessibilityRole="header"
                style={[styles.heading, employeeTextStyle("human", textAlign)]}
              >
                {copy.title}
              </Text>
              <Pressable
                accessibilityLabel={copy.close}
                accessibilityRole="button"
                onPress={() => setOpen(false)}
                style={styles.closeButton}
              >
                <Text style={styles.closeText}>×</Text>
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.content}>
              <Section title={copy.employeeInformation} textAlign={textAlign}>
                <InfoRow
                  label={copy.organization}
                  value={scope.organizationName}
                  textAlign={textAlign}
                />
                <InfoRow
                  label={copy.location}
                  value={scope.locationName}
                  textAlign={textAlign}
                />
                <InfoRow label={copy.role} value={role} textAlign={textAlign} />
              </Section>
              <Section title={copy.notifications} textAlign={textAlign}>
                <InfoRow
                  label={copy.retrievalNotifications}
                  textAlign={textAlign}
                  value={notificationState}
                />
                <NativePushPermissionStatus
                  locale={locale}
                  onRequestPermission={onRequestNotificationPermission}
                  snapshot={pushSnapshot}
                  textAlign={textAlign}
                />
              </Section>
              <Section title={copy.language} textAlign={textAlign}>
                <View accessibilityRole="radiogroup" style={styles.languages}>
                  <LanguageChoice
                    label={copy.english}
                    onPress={() => onSelectLocale("en")}
                    selected={locale === "en"}
                  />
                  <LanguageChoice
                    label="العربية"
                    onPress={() => onSelectLocale("ar")}
                    selected={locale === "ar"}
                  />
                </View>
              </Section>
              <Section title={copy.about} textAlign={textAlign}>
                <InfoRow
                  label={copy.appVersion}
                  value={buildValue("appVersion")}
                  textAlign={textAlign}
                />
                <InfoRow
                  label={copy.appBuild}
                  value={buildValue("appBuild")}
                  textAlign={textAlign}
                />
              </Section>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

function Section({
  children,
  textAlign,
  title,
}: {
  readonly children: ReactNode;
  readonly textAlign: "left" | "right";
  readonly title: string;
}) {
  return (
    <View style={styles.section}>
      <Text
        style={[styles.sectionTitle, employeeTextStyle("human", textAlign)]}
      >
        {title}
      </Text>
      {children}
    </View>
  );
}

function InfoRow({
  label,
  textAlign,
  value,
}: {
  readonly label: string;
  readonly textAlign: "left" | "right";
  readonly value: string;
}) {
  return (
    <View style={styles.infoRow}>
      <Text style={[styles.infoLabel, employeeTextStyle("human", textAlign)]}>
        {label}
      </Text>
      <Text
        numberOfLines={2}
        style={[styles.infoValue, employeeTextStyle("human", textAlign)]}
      >
        {value}
      </Text>
    </View>
  );
}

function LanguageChoice({
  label,
  onPress,
  selected,
}: {
  readonly label: string;
  readonly onPress: () => void;
  readonly selected: boolean;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.language, selected && styles.languageSelected]}
    >
      <Text
        style={[styles.languageText, selected && styles.languageTextSelected]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

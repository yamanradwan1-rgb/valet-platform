import { createEmployeeStyles } from "../appearance/employee-themed-styles";
import {
  useEmployeeStyles,
  useEmployeePalette,
} from "../appearance/employee-appearance-context";
import type {
  EmployeeShiftEndSession,
  EmployeeShiftEndSnapshot,
} from "@valet/employee-client";
import { ScrollView, Text, TextInput, View } from "react-native";

import { EmployeeButton } from "../employee-ui/employee-controls";
import { EmployeeCard } from "../employee-ui/employee-feedback";
import {
  employeeFieldHeights,
  employeeRadius,
  employeeSpacing as space,
} from "../employee-ui/employee-tokens";
import {
  employeeTextStyle,
  employeeTypography as type,
} from "../employee-ui/employee-typography";
import type { FoundationLocale } from "../foundation/foundation-locale";
import { NativeShiftDiagnosticsCard } from "./native-shift-diagnostics-card";
import { NativePhysicalDiagnosticsCard } from "../diagnostics/native-physical-diagnostics-card";
import { getNativeShiftCopy } from "./native-shift-copy";
import { NativeShiftPresenceStatus } from "./native-shift-presence-status";
import {
  NativeShiftInfoRow,
  NativeShiftSummaryDetails,
} from "./native-shift-summary-details";

export function NativeActiveShiftPanel({
  locale,
  onReviewTasks,
  session,
  snapshot,
  textAlign,
}: {
  readonly locale: FoundationLocale;
  readonly onReviewTasks: () => void;
  readonly session: EmployeeShiftEndSession;
  readonly snapshot: EmployeeShiftEndSnapshot;
  readonly textAlign: "left" | "right";
}) {
  const p = useEmployeePalette();
  const styles = useEmployeeStyles(stylesTheme);

  const copy = getNativeShiftCopy(locale);
  const authority = snapshot.authority;
  if (authority === null) return null;
  const locked = snapshot.phase === "submitting";

  return (
    <ScrollView
      contentContainerStyle={[
        styles.screen,
        { direction: locale === "ar" ? "rtl" : "ltr" },
      ]}
      keyboardShouldPersistTaps="handled"
      style={styles.container}
      testID="native-active-shift"
    >
      <View>
        <Text
          accessibilityRole="header"
          style={[styles.heading, employeeTextStyle("human", textAlign)]}
        >
          {copy.shift}
        </Text>
        <Text
          style={[styles.subheading, employeeTextStyle("human", textAlign)]}
        >
          {copy.organization} · {authority.organizationName}
        </Text>
      </View>
      <NativeShiftSummaryDetails
        authority={authority}
        locale={locale}
        textAlign={textAlign}
      />
      {snapshot.phase === "ended" && snapshot.result !== null ? (
        <EmployeeCard contentGap="none" padding="standard" variant="success">
          <Text
            accessibilityLiveRegion="polite"
            accessibilityRole="header"
            style={[styles.endedTitle, employeeTextStyle("human", textAlign)]}
          >
            {copy.shiftEnded}
          </Text>
          <NativeShiftInfoRow
            label={copy.cashExpected}
            textAlign={textAlign}
            value={snapshot.result.cashReconciliation.cashExpected}
            valueKind="identifier"
          />
          <NativeShiftInfoRow
            label={copy.cashReported}
            textAlign={textAlign}
            value={snapshot.result.cashReconciliation.cashReported}
            valueKind="identifier"
          />
          <NativeShiftInfoRow
            label={copy.cashVariance}
            textAlign={textAlign}
            value={`${snapshot.result.cashReconciliation.cashVariance} ${snapshot.result.cashReconciliation.currency}`}
            valueKind="identifier"
          />
        </EmployeeCard>
      ) : (
        <EmployeeCard contentGap="lg" padding="standard">
          <Text style={[styles.label, employeeTextStyle("human", textAlign)]}>
            {copy.cashReported}{" "}
            <Text style={employeeTextStyle("identifier", textAlign)}>
              {authority.currency}
            </Text>
          </Text>
          <Text style={[styles.helper, employeeTextStyle("human", textAlign)]}>
            {copy.cashReportedHelper}
          </Text>
          <TextInput
            editable={["active", "blocked-open-work", "error"].includes(
              snapshot.phase,
            )}
            accessibilityHint={copy.cashReportedHelper}
            accessibilityLabel={`${copy.cashReported} ${authority.currency}`}
            inputMode="decimal"
            keyboardType="decimal-pad"
            maxLength={15}
            onChangeText={(value) => session.setCashInput(value)}
            placeholder={copy.cashAmountPlaceholder}
            placeholderTextColor={p.textMuted}
            style={styles.cashInput}
            value={snapshot.cashInput}
          />
          {snapshot.cashValidationVisible ? (
            <Text
              style={[styles.validation, employeeTextStyle("human", textAlign)]}
            >
              {copy.cashReportedValidation}
            </Text>
          ) : null}
          {!snapshot.online ? (
            <Text
              style={[styles.validation, employeeTextStyle("human", textAlign)]}
            >
              {copy.noNetwork}
            </Text>
          ) : null}
          {snapshot.phase === "uncertain" ? (
            <View style={styles.uncertain} testID="native-shift-end-uncertain">
              <Text
                accessibilityLiveRegion="assertive"
                style={[
                  styles.uncertainText,
                  employeeTextStyle("human", textAlign),
                ]}
              >
                {copy.endShiftUncertain}
              </Text>
              <EmployeeButton
                disabled={!snapshot.online}
                label={copy.retryEnd}
                onPress={() => void session.retry()}
                variant="secondary"
              />
            </View>
          ) : null}
          {snapshot.phase === "blocked-open-work" ? (
            <View style={styles.blocked}>
              <Text
                style={[
                  styles.blockedText,
                  employeeTextStyle("human", textAlign),
                ]}
              >
                {copy.openWorkBlocked}
              </Text>
              <EmployeeButton
                label={copy.reviewTasks}
                onPress={onReviewTasks}
                variant="secondary"
              />
            </View>
          ) : snapshot.phase === "error" ? (
            <Text
              style={[styles.validation, employeeTextStyle("human", textAlign)]}
            >
              {copy.endShiftError}
            </Text>
          ) : null}
          <NativeShiftPresenceStatus
            session={session.presence}
            locale={locale}
            onCancel={() => session.suspendForBackground()}
            onContinue={() =>
              snapshot.phase === "uncertain"
                ? void session.retry()
                : session.requestConfirmation()
            }
          />
          {snapshot.phase === "confirming" ? (
            <View style={styles.confirm} testID="native-shift-end-confirmation">
              <Text
                style={[
                  styles.confirmText,
                  employeeTextStyle("human", textAlign),
                ]}
              >
                {copy.endShiftConfirmMessage}
              </Text>
              <EmployeeButton
                label={copy.endShiftConfirm}
                onPress={() => void session.endShift()}
                variant="danger"
              />
              <EmployeeButton
                label={copy.cancel}
                onPress={() => session.cancelConfirmation()}
                variant="secondary"
              />
            </View>
          ) : (
            <EmployeeButton
              busy={locked}
              disabled={!snapshot.online || snapshot.phase === "uncertain"}
              label={locked ? copy.endingShift : copy.endShift}
              onPress={() => session.requestConfirmation()}
              variant="danger"
            />
          )}
        </EmployeeCard>
      )}
      <NativeShiftDiagnosticsCard locale={locale} textAlign={textAlign} />
      {typeof __DEV__ === "boolean" && __DEV__ ? (
        <NativePhysicalDiagnosticsCard />
      ) : null}
    </ScrollView>
  );
}

const stylesTheme = createEmployeeStyles((p) => ({
  blocked: { gap: space.sm },
  cashInput: {
    ...type.operationalValue,
    backgroundColor: p.appBackground,
    borderColor: p.border,
    borderRadius: employeeRadius.form,
    borderWidth: 1,
    color: p.textPrimary,
    height: employeeFieldHeights.standard,
    paddingHorizontal: space.lg,
    textAlign: "center",
    writingDirection: "ltr",
  },
  confirm: { gap: space.sm },
  confirmText: { ...type.body, color: p.textPrimary, fontWeight: "600" },
  container: { flex: 1 },
  endedTitle: {
    ...type.pageTitle,
    color: p.textPrimary,
    fontFamily: "Space Grotesk",
    fontSize: 18,
  },
  heading: { ...type.pageTitle, color: p.textPrimary },
  helper: { ...type.small, color: p.textMuted },
  label: {
    ...type.small,
    color: p.textSecondary,
    fontWeight: "600",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  screen: { gap: space.screen, padding: space.screen },
  subheading: { ...type.body, color: p.textSecondary, marginTop: space.xs },
  uncertain: {
    backgroundColor: p.selectedSurface,
    borderColor: p.border,
    borderRadius: employeeRadius.form,
    borderWidth: 1,
    gap: space.sm,
    padding: space.md,
  },
  uncertainText: { ...type.small, color: p.textPrimary, fontWeight: "600" },
  validation: { ...type.small, color: p.danger, fontWeight: "600" },
  blockedText: { ...type.small, color: p.textPrimary, fontWeight: "600" },
}));

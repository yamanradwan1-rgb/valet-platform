import type {
  EmployeeShiftEndSession,
  EmployeeShiftEndSnapshot,
} from "@valet/employee-client";
import { ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { EmployeeButton } from "../employee-ui/employee-controls";
import { EmployeeCard, EmployeeError } from "../employee-ui/employee-feedback";
import {
  employeeColors as c,
  employeeFieldHeights,
  employeeRadius,
  employeeSpacing as space,
} from "../employee-ui/employee-tokens";
import {
  employeeTextStyle,
  employeeTypography as type,
} from "../employee-ui/employee-typography";
import type { FoundationLocale } from "../foundation/foundation-locale";
import { getNativeShiftCopy } from "./native-shift-copy";
import {
  NativeShiftInfoRow,
  NativeShiftSummaryDetails,
} from "./native-shift-summary-details";

export function NativeActiveShiftPanel({
  locale,
  onReviewTasks,
  onReturned,
  session,
  snapshot,
  textAlign,
}: {
  readonly locale: FoundationLocale;
  readonly onReviewTasks: () => void;
  readonly onReturned: () => void;
  readonly session: EmployeeShiftEndSession;
  readonly snapshot: EmployeeShiftEndSnapshot;
  readonly textAlign: "left" | "right";
}) {
  const copy = getNativeShiftCopy(locale);
  const authority = snapshot.authority;
  if (authority === null) return null;
  const locked = snapshot.phase === "submitting";

  return (
    <ScrollView
      contentContainerStyle={styles.screen}
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
        <EmployeeCard variant="success">
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
          <EmployeeButton
            label={copy.returnToStart}
            onPress={() => {
              session.finish();
              onReturned();
            }}
          />
        </EmployeeCard>
      ) : (
        <EmployeeCard>
          <Text style={[styles.label, employeeTextStyle("human", textAlign)]}>
            {copy.cashReported} {authority.currency}
          </Text>
          <Text style={[styles.helper, employeeTextStyle("human", textAlign)]}>
            {copy.cashReportedHelper}
          </Text>
          <TextInput
            accessibilityHint={copy.cashReportedHelper}
            accessibilityLabel={`${copy.cashReported} ${authority.currency}`}
            accessibilityState={{
              disabled: locked || snapshot.phase === "uncertain",
            }}
            editable={!locked && snapshot.phase !== "uncertain"}
            inputMode="decimal"
            keyboardType="decimal-pad"
            maxLength={15}
            onChangeText={(value) => session.setCashInput(value)}
            placeholder={copy.cashAmountPlaceholder}
            placeholderTextColor={c.muted}
            style={styles.cashInput}
            value={snapshot.cashInput}
          />
          {snapshot.cashValidationVisible ? (
            <EmployeeError textAlign={textAlign}>
              {copy.cashReportedValidation}
            </EmployeeError>
          ) : null}
          {!snapshot.online ? (
            <EmployeeError textAlign={textAlign}>
              {copy.noNetwork}
            </EmployeeError>
          ) : null}
          {snapshot.phase === "uncertain" ? (
            <View style={styles.uncertain} testID="native-shift-end-uncertain">
              <Text
                accessibilityLiveRegion="assertive"
                style={[
                  styles.uncertainTitle,
                  employeeTextStyle("human", textAlign),
                ]}
              >
                {copy.endShiftUncertainTitle}
              </Text>
              <Text
                style={[styles.helper, employeeTextStyle("human", textAlign)]}
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
              <EmployeeError textAlign={textAlign}>
                {copy.openWorkBlocked}
              </EmployeeError>
              <EmployeeButton
                label={copy.reviewTasks}
                onPress={onReviewTasks}
                variant="secondary"
              />
            </View>
          ) : snapshot.phase === "error" ? (
            <EmployeeError textAlign={textAlign}>
              {copy.endShiftError}
            </EmployeeError>
          ) : null}
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
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  blocked: { gap: space.sm },
  cashInput: {
    ...type.header,
    backgroundColor: c.warm,
    borderColor: c.border,
    borderRadius: employeeRadius.form,
    borderWidth: 1,
    color: c.navy,
    minHeight: employeeFieldHeights.standard,
    paddingHorizontal: space.lg,
    textAlign: "center",
    writingDirection: "ltr",
  },
  confirm: { gap: space.sm },
  confirmText: { ...type.body, color: c.navy, fontWeight: "600" },
  container: { flex: 1 },
  endedTitle: { ...type.label, color: c.navy, fontSize: 18, fontWeight: "700" },
  heading: { ...type.header, color: c.navy },
  helper: { ...type.small, color: c.muted },
  label: { ...type.badge, color: c.neutral, textTransform: "uppercase" },
  screen: { gap: space.lg, padding: space.screen },
  subheading: { ...type.body, color: c.neutral, marginTop: space.xs },
  uncertain: {
    backgroundColor: c.ice,
    borderColor: c.border,
    borderRadius: employeeRadius.form,
    borderWidth: 1,
    gap: space.sm,
    padding: space.md,
  },
  uncertainTitle: { ...type.small, color: c.navy, fontWeight: "700" },
});

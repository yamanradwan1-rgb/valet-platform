import { createEmployeeStyles } from "../appearance/employee-themed-styles";
import { useEmployeeStyles } from "../appearance/employee-appearance-context";
import { Text, View } from "react-native";

import { EmployeeCard } from "../employee-ui/employee-feedback";
import { employeeSpacing as space } from "../employee-ui/employee-tokens";
import {
  employeeFontFamilies,
  employeeTextStyle,
  employeeTypography as type,
} from "../employee-ui/employee-typography";
import { NativeShiftInfoRow } from "./native-shift-summary-details";
import { getNativeTelemetry } from "../telemetry/native-telemetry-owner";
import { nativeSupportDiagnosticsView } from "../telemetry/native-support-diagnostics";
import type { FoundationLocale } from "../foundation/foundation-locale";

/**
 * Read-only support diagnostics card (MOB-024A review fix #4).
 *
 * The evidence doc promises support can read the sanitized telemetry
 * snapshot; this card is the smallest safe LOCAL access seam that honors
 * it. It follows the existing info-display pattern of the Shift screen
 * (EmployeeCard + the shared NativeShiftInfoRow layout) and sits at the
 * BOTTOM of the shift screen — a diagnostics aid, not a redesign.
 *
 * INVARIANTS:
 * - Pulls the snapshot itself via the ambient module registry
 *   (`getNativeTelemetry().snapshot()`) — no business data crosses props.
 * - Bounded: a few provenance rows + at most 10 recent one-line events.
 * - READ-ONLY: it records nothing, mutates nothing, and cannot affect the
 *   authoritative Shift state (telemetry is non-authoritative).
 * - Labels come from the closed local EN/AR diagnostics map. The central
 *   dictionary mirrors Web exactly (dictionary-parity test), so this local
 *   support-only copy does not expand the product dictionary.
 */
export const NATIVE_SHIFT_DIAGNOSTICS_CARD_EVENT_LIMIT = 10;

const DIAGNOSTICS_COPY = {
  ar: {
    accessibilityLabel: "تشخيصات الدعم",
    appBuild: "إصدار البناء",
    appVersion: "إصدار التطبيق",
    eventCount: "عدد الأحداث",
    platform: "المنصة",
    title: "تشخيصات الدعم",
  },
  en: {
    accessibilityLabel: "Support diagnostics",
    appBuild: "App build",
    appVersion: "App version",
    eventCount: "Event count",
    platform: "Platform",
    title: "Support diagnostics",
  },
} as const;

export function NativeShiftDiagnosticsCard({
  locale,
  textAlign,
}: {
  readonly locale: FoundationLocale;
  readonly textAlign: "left" | "right";
}) {
  const styles = useEmployeeStyles(stylesTheme);

  // Read-only observation of the ambient registry — never a mutation.
  const view = nativeSupportDiagnosticsView(
    getNativeTelemetry().snapshot(),
    NATIVE_SHIFT_DIAGNOSTICS_CARD_EVENT_LIMIT,
  );
  const copy = DIAGNOSTICS_COPY[locale];
  return (
    <EmployeeCard
      accessibilityLabel={copy.accessibilityLabel}
      contentGap="none"
      padding="standard"
    >
      <Text
        accessibilityRole="header"
        style={[styles.title, employeeTextStyle("human", textAlign)]}
      >
        {copy.title}
      </Text>
      {view.buildRows.map((row) => (
        <NativeShiftInfoRow
          key={row.label}
          label={copy[row.label]}
          textAlign={textAlign}
          value={row.value}
          valueKind="identifier"
        />
      ))}
      {view.eventRows.length > 0 ? (
        <View style={styles.events} testID="native-shift-diagnostics-events">
          {view.eventRows.map((line, index) => (
            <Text
              key={`${index}-${line}`}
              style={[
                styles.eventLine,
                employeeTextStyle("identifier", "left"),
              ]}
            >
              {line}
            </Text>
          ))}
        </View>
      ) : null}
    </EmployeeCard>
  );
}

const stylesTheme = createEmployeeStyles((p) => ({
  eventLine: {
    ...type.small,
    color: p.textSecondary,
    fontFamily: employeeFontFamilies.display,
  },
  events: { gap: 2, paddingTop: space.md },
  title: {
    ...type.small,
    color: p.textMuted,
    fontWeight: "600",
    letterSpacing: 0.8,
    paddingBottom: space.sm,
    textTransform: "uppercase",
  },
}));

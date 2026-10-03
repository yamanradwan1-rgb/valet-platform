import { createEmployeeStyles } from "../appearance/employee-themed-styles";
import { useEmployeeStyles } from "../appearance/employee-appearance-context";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import type { EmployeeShiftEndAuthority } from "@valet/employee-client";

import { EmployeeBadge, EmployeeCard } from "../employee-ui/employee-feedback";
import { employeeSpacing as space } from "../employee-ui/employee-tokens";
import {
  employeeFontFamilies,
  employeeTextStyle,
  employeeTypography as type,
} from "../employee-ui/employee-typography";
import type { FoundationLocale } from "../foundation/foundation-locale";
import { formatNativeShiftDuration } from "./native-shift-duration";
import { getNativeShiftCopy } from "./native-shift-copy";

export { formatNativeShiftDuration } from "./native-shift-duration";

export function presentNativeShiftStartedAt(
  value: string,
  locale: FoundationLocale,
): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function NativeShiftInfoRow({
  label,
  secondaryIdentifier,
  textAlign,
  value,
  valueKind = "human",
}: {
  readonly label: string;
  readonly secondaryIdentifier?: string;
  readonly textAlign: "left" | "right";
  readonly value: string;
  readonly valueKind?: "human" | "identifier";
}) {
  const styles = useEmployeeStyles(stylesTheme);

  return (
    <View style={styles.row}>
      <Text style={[styles.label, employeeTextStyle("human", textAlign)]}>
        {label}
      </Text>
      <View
        style={[
          styles.valueGroup,
          { alignItems: textAlign === "right" ? "flex-start" : "flex-end" },
        ]}
      >
        <Text style={[styles.value, employeeTextStyle(valueKind, textAlign)]}>
          {value}
        </Text>
        {secondaryIdentifier ? (
          <Text
            style={[
              styles.identifier,
              employeeTextStyle("identifier", textAlign),
            ]}
          >
            {secondaryIdentifier}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function NativeShiftElapsed({
  locale,
  startedAt,
  textAlign,
}: {
  readonly locale: FoundationLocale;
  readonly startedAt: string;
  readonly textAlign: "left" | "right";
}) {
  const styles = useEmployeeStyles(stylesTheme);

  const [value, setValue] = useState(() =>
    formatNativeShiftDuration(startedAt, locale),
  );
  useEffect(() => {
    const timer = setInterval(
      () => setValue(formatNativeShiftDuration(startedAt, locale)),
      1_000,
    );
    return () => clearInterval(timer);
  }, [locale, startedAt]);
  return (
    <Text
      style={[styles.elapsedValue, employeeTextStyle("identifier", textAlign)]}
    >
      {value}
    </Text>
  );
}

export function NativeShiftSummaryDetails({
  authority,
  locale,
  textAlign,
}: {
  readonly authority: EmployeeShiftEndAuthority;
  readonly locale: FoundationLocale;
  readonly textAlign: "left" | "right";
}) {
  const styles = useEmployeeStyles(stylesTheme);

  const copy = getNativeShiftCopy(locale);
  const role =
    authority.role === "VALET_SUPERVISOR"
      ? copy.roleSupervisor
      : copy.roleEmployee;
  return (
    <EmployeeCard contentGap="none" padding="standard">
      <View style={styles.topRow}>
        <EmployeeBadge
          label={copy.activeBadge}
          showDot
          textAlign={textAlign}
          variant="primary"
        />
        <Text
          style={[styles.activeLabel, employeeTextStyle("human", textAlign)]}
        >
          {copy.activeShift}
        </Text>
      </View>
      <NativeShiftInfoRow
        label={copy.organization}
        textAlign={textAlign}
        value={authority.organizationName}
      />
      <NativeShiftInfoRow
        label={copy.location}
        secondaryIdentifier={authority.locationCode}
        textAlign={textAlign}
        value={authority.locationName}
      />
      <NativeShiftInfoRow
        label={copy.role}
        textAlign={textAlign}
        value={role}
      />
      <NativeShiftInfoRow
        label={copy.started}
        textAlign={textAlign}
        value={presentNativeShiftStartedAt(authority.shiftStartedAt, locale)}
        valueKind="identifier"
      />
      <View style={styles.elapsed}>
        <Text
          style={[styles.elapsedLabel, employeeTextStyle("human", textAlign)]}
        >
          {copy.elapsed}
        </Text>
        <NativeShiftElapsed
          locale={locale}
          startedAt={authority.shiftStartedAt}
          textAlign={textAlign}
        />
      </View>
    </EmployeeCard>
  );
}

const stylesTheme = createEmployeeStyles((p) => ({
  elapsed: {
    alignItems: "center",
    borderTopColor: p.border,
    borderTopWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: space.md,
  },
  elapsedLabel: {
    ...type.badge,
    color: p.textMuted,
    textTransform: "uppercase",
  },
  elapsedValue: {
    ...type.body,
    color: p.textPrimary,
    fontFamily: employeeFontFamilies.display,
    fontWeight: "700",
  },
  identifier: { ...type.small, color: p.textSecondary },
  label: { ...type.body, color: p.textSecondary, flexShrink: 0 },
  row: {
    alignItems: "flex-start",
    borderBottomColor: p.border,
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: space.md,
    justifyContent: "space-between",
    paddingVertical: space.md,
  },
  value: { ...type.body, color: p.textPrimary, fontWeight: "600" },
  valueGroup: { flex: 1, gap: 2 },
  topRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingBottom: space.lg,
  },
  activeLabel: { ...type.small, color: p.success, fontWeight: "600" },
}));

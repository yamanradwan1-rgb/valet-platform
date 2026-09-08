import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { EmployeeShiftEndAuthority } from "@valet/employee-client";

import { EmployeeBadge, EmployeeCard } from "../employee-ui/employee-feedback";
import {
  employeeColors as c,
  employeeSpacing as space,
} from "../employee-ui/employee-tokens";
import {
  employeeTextStyle,
  employeeTypography as type,
} from "../employee-ui/employee-typography";
import type { FoundationLocale } from "../foundation/foundation-locale";
import { getNativeShiftCopy } from "./native-shift-copy";

export function presentNativeShiftStartedAt(
  value: string,
  locale: FoundationLocale,
): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(locale, {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function formatNativeShiftDuration(
  startedAt: string,
  locale: FoundationLocale,
  now = Date.now(),
): string {
  const started = new Date(startedAt).getTime();
  const seconds = Number.isNaN(started)
    ? 0
    : Math.max(0, Math.floor((now - started) / 1000));
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  const units =
    locale === "ar"
      ? { day: "يوم", hour: "س", minute: "د" }
      : { day: "d", hour: "h", minute: "m" };
  return [
    days > 0 ? `${days}${units.day}` : null,
    hours > 0 ? `${hours}${units.hour}` : null,
    `${minutes}${units.minute}`,
  ]
    .filter(Boolean)
    .join(" ");
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
  return (
    <View
      style={[
        styles.row,
        { flexDirection: textAlign === "right" ? "row-reverse" : "row" },
      ]}
    >
      <Text style={[styles.label, employeeTextStyle("human", textAlign)]}>
        {label}
      </Text>
      <View style={styles.valueGroup}>
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
  const copy = getNativeShiftCopy(locale);
  const role =
    authority.role === "VALET_SUPERVISOR"
      ? copy.roleSupervisor
      : copy.roleEmployee;
  return (
    <EmployeeCard>
      <EmployeeBadge
        label={copy.activeShift}
        textAlign={textAlign}
        variant="success"
      />
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

const styles = StyleSheet.create({
  elapsed: {
    alignItems: "center",
    borderTopColor: c.border,
    borderTopWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: space.md,
  },
  elapsedLabel: { ...type.badge, color: c.muted, textTransform: "uppercase" },
  elapsedValue: { ...type.small, color: c.navy, fontWeight: "700" },
  identifier: { ...type.small, color: c.neutral },
  label: { ...type.body, color: c.neutral, flexShrink: 0 },
  row: {
    alignItems: "flex-start",
    borderTopColor: c.border,
    borderTopWidth: 1,
    gap: space.md,
    justifyContent: "space-between",
    paddingTop: space.md,
  },
  value: { ...type.body, color: c.navy, fontWeight: "600" },
  valueGroup: { alignItems: "stretch", flex: 1, gap: 2 },
});

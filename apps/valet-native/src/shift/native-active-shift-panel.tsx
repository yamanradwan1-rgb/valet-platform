import type { EmployeeOperationalScope } from "@valet/employee-client";
import { ScrollView, StyleSheet, Text, View } from "react-native";

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

function presentStartedAt(value: string, locale: FoundationLocale): string {
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

function InfoRow({
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
  const direction = textAlign === "right" ? "row-reverse" : "row";
  return (
    <View style={[styles.row, { flexDirection: direction }]}>
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

export function NativeActiveShiftPanel({
  locale,
  scope,
  textAlign,
}: {
  readonly locale: FoundationLocale;
  readonly scope: EmployeeOperationalScope;
  readonly textAlign: "left" | "right";
}) {
  const copy = getNativeShiftCopy(locale);
  const role =
    scope.role === "VALET_SUPERVISOR" ? copy.roleSupervisor : copy.roleEmployee;
  return (
    <ScrollView
      contentContainerStyle={styles.screen}
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
          {copy.organization} · {scope.organizationName}
        </Text>
      </View>
      <EmployeeCard>
        <EmployeeBadge
          label={copy.activeShift}
          textAlign={textAlign}
          variant="success"
        />
        <InfoRow
          label={copy.organization}
          textAlign={textAlign}
          value={scope.organizationName}
        />
        <InfoRow
          label={copy.location}
          secondaryIdentifier={scope.locationCode}
          textAlign={textAlign}
          value={scope.locationName}
        />
        <InfoRow label={copy.role} textAlign={textAlign} value={role} />
        <InfoRow
          label={copy.started}
          textAlign={textAlign}
          value={presentStartedAt(scope.shiftStartedAt, locale)}
        />
      </EmployeeCard>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  heading: { ...type.header, color: c.navy },
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
  screen: { gap: space.lg, padding: space.screen },
  subheading: { ...type.body, color: c.neutral, marginTop: space.xs },
  value: { ...type.body, color: c.navy, fontWeight: "600" },
  valueGroup: { alignItems: "stretch", flex: 1, gap: 2 },
});

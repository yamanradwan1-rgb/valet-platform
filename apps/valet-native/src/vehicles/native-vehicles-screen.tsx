import { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import type {
  EmployeeOperationalScope,
  EmployeeVehicleDirectorySession,
  EmployeeVehicleDirectorySnapshot,
} from "@valet/employee-client";

import { EmployeeButton } from "../employee-ui/employee-controls";
import {
  employeeColors as c,
  employeeRadius,
} from "../employee-ui/employee-tokens";
import {
  employeeTextStyle,
  employeeTypography as type,
} from "../employee-ui/employee-typography";
import type { FoundationLocale } from "../foundation/foundation-locale";
import { NativeVehicleRow } from "./native-vehicle-row";
import { getNativeVehiclesCopy } from "./native-vehicles-copy";

export function NativeVehiclesScreen(props: {
  readonly directory: EmployeeVehicleDirectorySession;
  readonly locale: FoundationLocale;
  readonly scope: EmployeeOperationalScope;
  readonly snapshot: EmployeeVehicleDirectorySnapshot;
  readonly textAlign: "left" | "right";
}) {
  const { directory, locale, scope, snapshot, textAlign } = props;
  const copy = getNativeVehiclesCopy(locale);
  const human = employeeTextStyle("human", textAlign);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const page = snapshot.page;
  return (
    <ScrollView
      contentContainerStyle={s.screen}
      testID="native-vehicles-screen"
    >
      <View>
        <Text accessibilityRole="header" style={[s.title, human]}>
          {copy.vehicles}
        </Text>
        <Text style={[s.subtitle, human]}>
          {copy.location} · {scope.locationName}
        </Text>
      </View>
      {page?.truncated ? (
        <Text style={[s.warning, human]}>{copy.truncated}</Text>
      ) : null}
      {snapshot.phase === "refreshing" ? (
        <Text style={[s.refreshing, human]}>{copy.refreshing}</Text>
      ) : null}
      {snapshot.phase === "loading" || snapshot.phase === "inactive" ? (
        <View style={s.stack} accessibilityState={{ busy: true }}>
          <Text style={[s.loading, human]}>{copy.loading}</Text>
          {[0, 1, 2].map((index) => (
            <VehicleSkeleton key={index} />
          ))}
        </View>
      ) : snapshot.phase === "error" ? (
        <View style={s.stateCard}>
          <Text style={[s.stateTitle, human]}>{copy.loadFailed}</Text>
          <Text style={[s.stateDetail, human]}>{copy.operationFailed}</Text>
          <EmployeeButton
            label={copy.retry}
            onPress={() => void directory.refresh()}
            size="standard"
            variant="secondary"
          />
        </View>
      ) : page !== null && page.rows.length === 0 ? (
        <View style={s.stateCard}>
          <Text style={[s.stateTitle, human]}>{copy.emptyTitle}</Text>
          <Text style={[s.stateDetail, human]}>{copy.emptyDetail}</Text>
        </View>
      ) : (
        <View style={s.stack}>
          {page?.rows.map((row) => (
            <NativeVehicleRow
              copy={copy}
              expanded={expandedId === row.sessionId}
              key={row.sessionId}
              locale={locale}
              onToggle={() =>
                setExpandedId((current) =>
                  current === row.sessionId ? null : row.sessionId,
                )
              }
              row={row}
              textAlign={textAlign}
            />
          ))}
        </View>
      )}
    </ScrollView>
  );
}

function VehicleSkeleton() {
  return (
    <View
      accessible={false}
      style={s.skeleton}
      testID="native-vehicle-skeleton"
    >
      <View style={s.skeletonTitle} />
      <View style={s.skeletonDetail} />
    </View>
  );
}

export const nativeVehiclesScreenStyles = StyleSheet.create({
  screen: { gap: 16, padding: 20 },
  title: { ...type.pageTitle, color: c.navy },
  subtitle: { ...type.body, color: c.neutral, marginTop: 4 },
  warning: {
    ...type.supporting,
    backgroundColor: "#FFF4E0",
    borderColor: "#D8943433",
    borderRadius: employeeRadius.form,
    borderWidth: 1,
    color: c.warning,
    fontWeight: "600",
    lineHeight: 20,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  refreshing: { ...type.supporting, color: c.muted },
  loading: { ...type.body, color: c.neutral },
  stack: { gap: 12 },
  skeleton: {
    backgroundColor: c.white,
    borderColor: c.border,
    borderRadius: employeeRadius.form,
    borderWidth: 1,
    gap: 8,
    padding: 16,
  },
  skeletonTitle: {
    backgroundColor: "#E5E7EB",
    borderRadius: 4,
    height: 16,
    width: "66.666%",
  },
  skeletonDetail: {
    backgroundColor: "#F3F4F6",
    borderRadius: 4,
    height: 12,
    width: "33.333%",
  },
  stateCard: {
    backgroundColor: c.white,
    borderColor: c.border,
    borderRadius: employeeRadius.primary,
    borderWidth: 1,
    gap: 12,
    padding: 20,
  },
  stateTitle: {
    ...type.pageTitle,
    color: c.navy,
    fontFamily: type.vehicleIdentity.fontFamily,
    fontSize: 18,
  },
  stateDetail: { ...type.supporting, color: c.neutral, lineHeight: 20 },
});

const s = nativeVehiclesScreenStyles;

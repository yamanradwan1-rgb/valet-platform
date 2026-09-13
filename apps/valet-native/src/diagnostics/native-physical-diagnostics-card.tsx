import { useState, useSyncExternalStore } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { EmployeeCard } from "../employee-ui/employee-feedback";
import {
  employeeColors as c,
  employeeSpacing as space,
} from "../employee-ui/employee-tokens";
import { employeeTypography as type } from "../employee-ui/employee-typography";
import { getPhysicalDiagnostics } from "./native-physical-diagnostics";
import {
  physicalMetrics,
  summarizePhysicalSamples,
} from "./native-physical-diagnostics-model";

export function NativePhysicalDiagnosticsCard() {
  const owner = getPhysicalDiagnostics();
  const samples = useSyncExternalStore(owner.subscribe, owner.snapshot);
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  if (!__DEV__) return null;
  if (!expanded)
    return (
      <Action
        label="Physical Performance Diagnostics"
        onPress={() => setExpanded(true)}
      />
    );
  return (
    <EmployeeCard contentGap="none" padding="standard">
      <Text accessibilityRole="header" style={styles.title}>
        Physical Performance Diagnostics
      </Text>
      <Text style={styles.warning}>
        Development evidence only · build SHA must be recorded manually
      </Text>
      {physicalMetrics.map((metric) => {
        const summary = summarizePhysicalSamples(
          samples.filter((sample) => sample.metric === metric),
        );
        return (
          <View key={metric} style={styles.metric}>
            <Text style={styles.metricName}>{metric}</Text>
            <Text style={styles.value}>
              n={summary.samples} · p50={show(summary.p50Ms)} · p95=
              {show(summary.p95Ms)} · p99={show(summary.p99Ms)} · failures=
              {summary.failures}
            </Text>
          </View>
        );
      })}
      <Action
        label={
          copied ? "Sanitized JSON copied" : "Copy sanitized JSON evidence"
        }
        onPress={() => {
          void import("expo-clipboard")
            .then((clipboard) =>
              clipboard.setStringAsync(
                JSON.stringify(owner.evidence(), null, 2),
              ),
            )
            .then(() => setCopied(true));
        }}
      />
      <Action label="Clear measurements" onPress={() => void owner.clear()} />
      <Action label="Hide" onPress={() => setExpanded(false)} />
    </EmployeeCard>
  );
}

function Action({
  label,
  onPress,
}: {
  readonly label: string;
  readonly onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={styles.button}
    >
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
}

function show(value: number | null): string {
  return value === null ? "—" : `${value}ms`;
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: c.navy,
    borderRadius: 8,
    marginTop: space.sm,
    padding: space.md,
  },
  buttonText: { color: c.white, textAlign: "center" },
  metric: {
    borderTopColor: c.border,
    borderTopWidth: 1,
    gap: 2,
    paddingVertical: space.sm,
  },
  metricName: { ...type.small, color: c.navy, fontWeight: "600" },
  title: {
    ...type.small,
    color: c.navy,
    fontWeight: "700",
    paddingBottom: space.sm,
  },
  value: { ...type.small, color: c.neutral },
  warning: { ...type.small, color: c.muted, paddingBottom: space.sm },
});

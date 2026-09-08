import type { EmployeeLocale } from "@valet/employee-client";
import { Pressable, StyleSheet, Text, View } from "react-native";

import {
  EmployeeCarIcon,
  EmployeeHomeIcon,
  EmployeeScanIcon,
  EmployeeShiftIcon,
} from "../employee-ui/employee-icons";
import {
  employeeColors as c,
  employeeMinimumTouchTarget,
  employeeSpacing as space,
} from "../employee-ui/employee-tokens";
import { employeeTypography as type } from "../employee-ui/employee-typography";
import { getNativeShellCopy } from "./native-shell-copy";
import type { ProductionDestination } from "./production-shell-controller";

interface NavigationItem {
  readonly destination: ProductionDestination;
  readonly icon: typeof EmployeeHomeIcon;
  readonly prominent?: boolean;
  readonly title: "scan" | "shift" | "tasks" | "vehicles";
}

const items: readonly NavigationItem[] = [
  { destination: "tasks", icon: EmployeeHomeIcon, title: "tasks" },
  { destination: "vehicles", icon: EmployeeCarIcon, title: "vehicles" },
  {
    destination: "scan",
    icon: EmployeeScanIcon,
    prominent: true,
    title: "scan",
  },
  { destination: "shift", icon: EmployeeShiftIcon, title: "shift" },
];

export function NativeProductionNavigation({
  activeDestination,
  locale,
  onNavigate,
  pinned,
}: {
  readonly activeDestination:
    "check-in" | "parking" | "retrieval" | "shift" | "tasks";
  readonly locale: EmployeeLocale;
  readonly onNavigate: (destination: ProductionDestination) => void;
  readonly pinned: boolean;
}) {
  const copy = getNativeShellCopy(locale);
  return (
    <View
      accessibilityRole="tablist"
      style={styles.bar}
      testID="native-production-navigation"
    >
      {items.map((item) => {
        const available =
          item.destination === "tasks" || item.destination === "shift";
        const enabled = available && !pinned;
        const active = item.destination === activeDestination && !pinned;
        const Icon = item.icon;
        const label = copy[item.title];
        const accessibilityLabel = available
          ? label
          : `${label}. ${copy.unavailable}`;
        return (
          <Pressable
            accessibilityLabel={accessibilityLabel}
            accessibilityRole="tab"
            accessibilityState={{ disabled: !enabled, selected: active }}
            disabled={!enabled}
            key={item.destination}
            onPress={() => onNavigate(item.destination)}
            style={[styles.item, !enabled && styles.disabled]}
          >
            <View style={item.prominent ? styles.scanIcon : styles.icon}>
              <Icon active={active} inverse={item.prominent === true} />
            </View>
            <Text style={[styles.label, active && styles.activeLabel]}>
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  activeLabel: { color: c.blue },
  bar: {
    alignItems: "flex-end",
    backgroundColor: c.white,
    borderTopColor: c.border,
    borderTopWidth: 1,
    flexDirection: "row",
    minHeight: 72,
    paddingHorizontal: space.sm,
  },
  disabled: { opacity: 0.4 },
  icon: { alignItems: "center", height: 28, justifyContent: "center" },
  item: {
    alignItems: "center",
    flex: 1,
    justifyContent: "flex-end",
    minHeight: employeeMinimumTouchTarget,
    paddingBottom: space.md,
    paddingTop: space.sm,
  },
  label: { ...type.badge, color: c.neutral, marginTop: 2 },
  scanIcon: {
    alignItems: "center",
    backgroundColor: c.neutral,
    borderRadius: 18,
    height: 48,
    justifyContent: "center",
    marginTop: -24,
    width: 48,
  },
});

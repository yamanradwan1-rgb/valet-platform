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
  employeeSpacing as space,
} from "../employee-ui/employee-tokens";
import {
  employeeFontFamilies,
  employeeFontWeights,
} from "../employee-ui/employee-typography";
import { getNativeShellCopy } from "./native-shell-copy";
import type { ProductionDestination } from "./production-shell-controller";

type NavigationDestination = Extract<
  ProductionDestination,
  "scan" | "shift" | "tasks" | "vehicles"
>;

interface NavigationItem {
  readonly destination: NavigationDestination;
  readonly icon: typeof EmployeeHomeIcon;
  readonly prominent?: boolean;
  readonly title: "scan" | "shiftNav" | "tasks" | "vehicles";
}

export const nativeProductionNavigationItems: readonly NavigationItem[] = [
  { destination: "tasks", icon: EmployeeHomeIcon, title: "tasks" },
  { destination: "vehicles", icon: EmployeeCarIcon, title: "vehicles" },
  {
    destination: "scan",
    icon: EmployeeScanIcon,
    prominent: true,
    title: "scan",
  },
  { destination: "shift", icon: EmployeeShiftIcon, title: "shiftNav" },
];

export const nativeProductionDestinationAvailability = {
  scan: true,
  shift: true,
  tasks: true,
  vehicles: true,
} as const satisfies Record<NavigationDestination, boolean>;

export function NativeProductionNavigation({
  activeDestination,
  locale,
  onNavigate,
  pinned,
}: {
  readonly activeDestination:
    | "check-in"
    | "parking"
    | "retrieval"
    | "scan"
    | "shift"
    | "tasks"
    | "vehicles";
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
      {nativeProductionNavigationItems.map((item) => {
        const available =
          nativeProductionDestinationAvailability[item.destination];
        const enabled = available && !pinned;
        const active = enabled && item.destination === activeDestination;
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
            <View
              style={[
                item.prominent ? styles.scanIcon : styles.icon,
                item.prominent &&
                  (enabled ? styles.scanIconEnabled : styles.scanIconDisabled),
              ]}
            >
              <Icon
                active={active}
                inverse={item.prominent === true}
                size={22}
              />
            </View>
            <Text
              style={[
                styles.label,
                item.prominent && styles.scanLabel,
                active && !item.prominent && styles.activeLabel,
              ]}
            >
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
    flexShrink: 0,
    height: 72,
    paddingHorizontal: space.sm,
  },
  disabled: { opacity: 0.4 },
  icon: { height: 22, width: 22 },
  item: {
    alignItems: "center",
    gap: space.xs,
    flex: 1,
    height: 72,
    justifyContent: "flex-end",
    paddingBottom: space.md,
    paddingTop: space.sm,
  },
  label: {
    color: c.neutral,
    fontFamily: employeeFontFamilies.ui,
    fontSize: 10,
    fontWeight: employeeFontWeights.semiBold,
    lineHeight: 12,
  },
  scanIcon: {
    alignItems: "center",
    borderRadius: 18,
    height: 46,
    justifyContent: "center",
    marginTop: -20,
    padding: 12,
    width: 46,
  },
  scanIconDisabled: { backgroundColor: c.neutral },
  scanIconEnabled: {
    backgroundColor: c.blue,
    elevation: 8,
    shadowColor: c.blue,
    shadowOffset: { height: 4, width: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  scanLabel: { marginTop: 2 },
});

export const nativeProductionNavigationStyles = styles;

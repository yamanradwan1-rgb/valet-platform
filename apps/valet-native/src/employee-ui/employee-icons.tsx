import { StyleSheet, View } from "react-native";

import { employeeColors as c } from "./employee-tokens";

interface NavigationIconProps {
  readonly active?: boolean;
  readonly inverse?: boolean;
}

export function EmployeeBackIcon({
  direction,
}: {
  readonly direction: "ltr" | "rtl";
}) {
  return (
    <View accessible={false} style={iconStyles.backFrame}>
      <View
        style={[
          iconStyles.backStroke,
          { transform: [{ rotate: direction === "rtl" ? "225deg" : "45deg" }] },
        ]}
      />
    </View>
  );
}

export function EmployeePlusIcon() {
  return (
    <View accessible={false} style={iconStyles.plusFrame}>
      <View style={iconStyles.plusHorizontal} />
      <View style={iconStyles.plusVertical} />
    </View>
  );
}

function iconColor({ active = false, inverse = false }: NavigationIconProps) {
  return inverse ? c.white : active ? c.blue : c.neutral;
}

export function EmployeeHomeIcon(props: NavigationIconProps) {
  const color = iconColor(props);
  return (
    <View accessible={false} style={iconStyles.navFrame}>
      <View style={[iconStyles.homeRoof, { borderColor: color }]} />
      <View style={[iconStyles.homeBody, { borderColor: color }]} />
    </View>
  );
}

export function EmployeeCarIcon(props: NavigationIconProps) {
  const color = iconColor(props);
  return (
    <View accessible={false} style={iconStyles.navFrame}>
      <View style={[iconStyles.carBody, { borderColor: color }]} />
      <View style={[iconStyles.carWheelLeft, { backgroundColor: color }]} />
      <View style={[iconStyles.carWheelRight, { backgroundColor: color }]} />
    </View>
  );
}

export function EmployeeScanIcon(props: NavigationIconProps) {
  const color = iconColor(props);
  return (
    <View accessible={false} style={iconStyles.navFrame}>
      <View style={[iconStyles.scanTopLeft, { borderColor: color }]} />
      <View style={[iconStyles.scanTopRight, { borderColor: color }]} />
      <View style={[iconStyles.scanBottomLeft, { borderColor: color }]} />
      <View style={[iconStyles.scanBottomRight, { borderColor: color }]} />
    </View>
  );
}

export function EmployeeShiftIcon(props: NavigationIconProps) {
  const color = iconColor(props);
  return (
    <View
      accessible={false}
      style={[iconStyles.shiftFace, { borderColor: color }]}
    >
      <View style={[iconStyles.shiftHand, { backgroundColor: color }]} />
    </View>
  );
}

/** Small check used inside a selected option circle (Web CheckSmIcon). */
export function EmployeeCheckIcon({
  inverse = false,
}: {
  readonly inverse?: boolean;
}) {
  return (
    <View accessible={false} style={iconStyles.checkFrame}>
      <View
        style={[
          iconStyles.checkStroke,
          { borderBottomColor: inverse ? c.white : c.navy },
        ]}
      />
    </View>
  );
}

const iconStyles = StyleSheet.create({
  backFrame: { height: 24, justifyContent: "center", width: 24 },
  backStroke: {
    borderBottomColor: c.navy,
    borderBottomWidth: 1.75,
    borderLeftColor: c.navy,
    borderLeftWidth: 1.75,
    height: 10,
    marginLeft: 7,
    width: 10,
  },
  plusFrame: { height: 14, position: "relative", width: 14 },
  plusHorizontal: {
    backgroundColor: c.white,
    borderRadius: 1,
    height: 2,
    left: 2,
    position: "absolute",
    top: 6,
    width: 10,
  },
  plusVertical: {
    backgroundColor: c.white,
    borderRadius: 1,
    height: 10,
    left: 6,
    position: "absolute",
    top: 2,
    width: 2,
  },
  navFrame: { height: 24, position: "relative", width: 24 },
  homeRoof: {
    borderLeftWidth: 1.75,
    borderTopWidth: 1.75,
    height: 13,
    left: 5,
    position: "absolute",
    top: 2,
    transform: [{ rotate: "45deg" }],
    width: 13,
  },
  homeBody: {
    borderBottomWidth: 1.75,
    borderLeftWidth: 1.75,
    borderRightWidth: 1.75,
    height: 11,
    left: 5,
    position: "absolute",
    top: 10,
    width: 14,
  },
  carBody: {
    borderRadius: 4,
    borderWidth: 1.75,
    height: 10,
    left: 2,
    position: "absolute",
    top: 8,
    width: 20,
  },
  carWheelLeft: {
    borderRadius: 2,
    bottom: 3,
    height: 4,
    left: 5,
    position: "absolute",
    width: 4,
  },
  carWheelRight: {
    borderRadius: 2,
    bottom: 3,
    height: 4,
    position: "absolute",
    right: 5,
    width: 4,
  },
  scanTopLeft: {
    borderLeftWidth: 1.75,
    borderTopWidth: 1.75,
    height: 8,
    left: 2,
    position: "absolute",
    top: 2,
    width: 8,
  },
  scanTopRight: {
    borderRightWidth: 1.75,
    borderTopWidth: 1.75,
    height: 8,
    position: "absolute",
    right: 2,
    top: 2,
    width: 8,
  },
  scanBottomLeft: {
    borderBottomWidth: 1.75,
    borderLeftWidth: 1.75,
    bottom: 2,
    height: 8,
    left: 2,
    position: "absolute",
    width: 8,
  },
  scanBottomRight: {
    borderBottomWidth: 1.75,
    borderRightWidth: 1.75,
    bottom: 2,
    height: 8,
    position: "absolute",
    right: 2,
    width: 8,
  },
  shiftFace: {
    borderRadius: 12,
    borderWidth: 1.75,
    height: 22,
    margin: 1,
    position: "relative",
    width: 22,
  },
  shiftHand: {
    height: 7,
    left: 9,
    position: "absolute",
    top: 4,
    transform: [{ rotate: "-35deg" }],
    width: 1.75,
  },
  checkFrame: {
    height: 12,
    justifyContent: "center",
    width: 12,
  },
  checkStroke: {
    borderBottomColor: c.navy,
    borderBottomLeftRadius: 1,
    borderBottomRightRadius: 1,
    borderBottomWidth: 1.75,
    borderLeftColor: c.navy,
    borderLeftWidth: 1.75,
    height: 6,
    marginLeft: 2,
    transform: [{ rotate: "45deg" }],
    width: 6,
  },
});

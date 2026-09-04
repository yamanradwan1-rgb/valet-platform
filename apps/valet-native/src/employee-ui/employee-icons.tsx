import { StyleSheet, View } from "react-native";

import { employeeColors as c } from "./employee-tokens";

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
});

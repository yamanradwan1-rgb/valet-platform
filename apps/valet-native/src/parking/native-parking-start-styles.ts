import { StyleSheet } from "react-native";

import {
  employeeColors as c,
  employeeSpacing as space,
} from "../employee-ui/employee-tokens";
import { employeeTypography as type } from "../employee-ui/employee-typography";

export const nativeParkingStartStyles = StyleSheet.create({
  body: { gap: space.lg, padding: space.screen },
  identifier: { ...type.header, color: c.navy },
  title: { ...type.vehicle, color: c.navy },
});

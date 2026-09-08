import { StyleSheet } from "react-native";

import {
  employeeColors as c,
  employeeSpacing as space,
} from "../employee-ui/employee-tokens";
import { employeeTypography as type } from "../employee-ui/employee-typography";

export const nativeRetrievalStyles = StyleSheet.create({
  body: { gap: space.lg, padding: space.screen },
  expectedKey: {
    ...type.header,
    backgroundColor: c.ice,
    borderRadius: 16,
    color: c.navy,
    padding: space.lg,
    textAlign: "center",
  },
  identifier: { ...type.header, color: c.navy },
  title: { ...type.vehicle, color: c.navy },
});

import { createEmployeeStyles } from "../appearance/employee-themed-styles";

import { employeeSpacing as space } from "../employee-ui/employee-tokens";
import { employeeTypography as type } from "../employee-ui/employee-typography";

export const nativeParkingStartStylesTheme = createEmployeeStyles((p) => ({
  body: { gap: space.lg, padding: space.screen },
  identifier: { ...type.header, color: p.textPrimary },
  title: { ...type.vehicle, color: p.textPrimary },
}));
export const nativeParkingStartStyles = nativeParkingStartStylesTheme.light;

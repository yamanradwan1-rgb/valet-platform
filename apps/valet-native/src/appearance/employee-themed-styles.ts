import { StyleSheet } from "react-native";
import { employeePalettes, type EmployeePalette } from "./employee-palette";

/** Both immutable sheets are created once per module, never per render. */
export function createEmployeeStyles<T extends StyleSheet.NamedStyles<T>>(
  factory: (palette: EmployeePalette) => T,
): Readonly<{ light: T; dark: T }> {
  return Object.freeze({
    light: StyleSheet.create(factory(employeePalettes.light)),
    dark: StyleSheet.create(factory(employeePalettes.dark)),
  });
}

export function createEmployeeValues<T>(
  factory: (palette: EmployeePalette) => T,
) {
  return Object.freeze({
    light: factory(employeePalettes.light),
    dark: factory(employeePalettes.dark),
  });
}

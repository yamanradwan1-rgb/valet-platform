import { describe, expect, it } from "vitest";

import {
  employeeButtonHeights,
  employeeCardPadding,
  employeeColors,
  employeeFieldHeights,
  employeeRadius,
  employeeSpacing,
  employeeStatusColors,
} from "../src/employee-ui/employee-tokens";
import {
  employeeFontFamilies,
  employeeTypography,
} from "../src/employee-ui/employee-typography";

describe("Employee visual tokens (Employee Web authority)", () => {
  it("locks the complete approved core palette", () => {
    expect(employeeColors).toEqual({
      warm: "#FAFAF8",
      white: "#FFFFFF",
      navy: "#07111F",
      navy2: "#0B1626",
      navy3: "#111E30",
      blue: "#176BFF",
      ice: "#EDF4FF",
      neutral: "#6F7C91",
      muted: "#8C98AA",
      border: "#DDE4EC",
      success: "#2F9B78",
      warning: "#D89434",
      danger: "#D95C63",
    });
  });

  it("locks Web geometry and the transitional tall-field sizes", () => {
    expect(Object.values(employeeSpacing)).toEqual([4, 6, 8, 12, 16, 20, 24]);
    expect(employeeCardPadding).toEqual({
      compact: 16,
      standard: 20,
      spacious: 24,
    });
    expect(employeeRadius).toEqual({ primary: 16, form: 12, pill: 999 });
    expect(employeeButtonHeights).toEqual({
      large: 56,
      standard: 44,
      compact: 36,
    });
    expect(employeeFieldHeights).toEqual({
      standard: 48,
      plate: 56,
      phone: 56,
    });
  });

  it("retains every Web badge surface and its semantic dot color", () => {
    expect(employeeStatusColors).toEqual({
      neutral: {
        backgroundColor: "#F5F6F8",
        color: "#6F7C91",
        dotColor: "#6F7C91",
      },
      primary: {
        backgroundColor: "#EDF4FF",
        color: "#176BFF",
        dotColor: "#176BFF",
      },
      success: {
        backgroundColor: "#EEFBF5",
        color: "#2F9B78",
        dotColor: "#2F9B78",
      },
      successSoft: {
        backgroundColor: "#F0FFF8",
        color: "#2F9B78",
        dotColor: "#2F9B78",
      },
      warning: {
        backgroundColor: "#FFF4E0",
        color: "#D89434",
        dotColor: "#D89434",
      },
      danger: {
        backgroundColor: "#FFF0F0",
        color: "#D95C63",
        dotColor: "#D95C63",
      },
    });
  });
});

describe("Employee typography roles", () => {
  it.each([
    ["pageTitle", employeeFontFamilies.ui, 20, "700", 28],
    ["pageTitleLarge", employeeFontFamilies.ui, 24, "700", 32],
    ["backHeaderTitle", employeeFontFamilies.ui, 17, "600", undefined],
    ["vehicleIdentity", employeeFontFamilies.display, 26, "700", 32.5],
    ["plateHero", employeeFontFamilies.display, 36, "700", undefined],
    ["operationalValue", employeeFontFamilies.display, 20, "600", 28],
    ["operationalValueStrong", employeeFontFamilies.display, 20, "700", 28],
    ["body", employeeFontFamilies.ui, 14, "400", 20],
    ["supporting", employeeFontFamilies.ui, 12, "400", 16],
    ["supportingLarge", employeeFontFamilies.ui, 13, "400", undefined],
  ] as const)(
    "defines %s from the current Web role",
    (role, fontFamily, fontSize, fontWeight, lineHeight) => {
      expect(employeeTypography[role]).toMatchObject({
        fontFamily,
        fontSize,
        fontWeight,
      });
      expect(employeeTypography[role].lineHeight).toBe(lineHeight);
    },
  );

  it("keeps legacy names as identity-preserving transitional references", () => {
    expect(employeeTypography.header).toBe(employeeTypography.backHeaderTitle);
    expect(employeeTypography.vehicle).toBe(employeeTypography.vehicleIdentity);
    expect(employeeTypography.plate).toBe(employeeTypography.plateHero);
    expect(employeeTypography.plateField).toBe(
      employeeTypography.operationalValueStrong,
    );
    expect(employeeTypography.small).toBe(employeeTypography.supporting);
    expect(employeeTypography.badge).toMatchObject({
      fontFamily: employeeFontFamilies.ui,
      fontSize: 10,
      fontWeight: "700",
      letterSpacing: 0.5,
    });
  });
});

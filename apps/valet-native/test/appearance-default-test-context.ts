import { vi } from "vitest";

// Existing pure render harnesses stub React hooks and call components directly.
// Keep those Light regressions intact; dedicated appearance tests override this
// presentation-only boundary to exercise both palettes and the real owner.
vi.mock("../src/appearance/employee-appearance-context", async () => {
  const { employeeLightPalette } =
    await import("../src/appearance/employee-palette");
  return {
    useEmployeePalette: () => employeeLightPalette,
    useEmployeeStyles: <T>(styles: { light: T }) => styles.light,
    useEmployeeAppearance: () => ({
      palette: employeeLightPalette,
      ready: true,
      select: vi.fn(),
    }),
  };
});

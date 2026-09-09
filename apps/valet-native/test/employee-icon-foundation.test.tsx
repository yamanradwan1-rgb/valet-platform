import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ReactElement } from "react";
import { describe, expect, it } from "vitest";

import {
  EmployeeAlertIcon,
  EmployeeBackIcon,
  EmployeeBigCheckIcon,
  EmployeeCameraSquareIcon,
  EmployeeCarIcon,
  EmployeeCheckSmallIcon,
  EmployeeChevronLeftIcon,
  EmployeeChevronRightIcon,
  EmployeeHomeIcon,
  EmployeeKeyIcon,
  EmployeeLocationPinIcon,
  EmployeePlusIcon,
  EmployeeScanIcon,
  EmployeeSearchIcon,
  EmployeeShiftIcon,
} from "../src/employee-ui/employee-icons";
import { employeeColors } from "../src/employee-ui/employee-tokens";

type Element = ReactElement<Record<string, unknown>>;

function elements(value: unknown): Element[] {
  if (Array.isArray(value)) return value.flatMap(elements);
  if (!value || typeof value !== "object" || !("props" in value)) return [];
  const node = value as Element;
  if (typeof node.type === "function") {
    return elements((node.type as (props: unknown) => unknown)(node.props));
  }
  return [node, ...elements(node.props.children)];
}

const canonicalIcons = [
  () => EmployeeHomeIcon({}),
  () => EmployeeCarIcon({}),
  () => EmployeeScanIcon({}),
  () => EmployeeShiftIcon({}),
  () => EmployeeChevronLeftIcon(),
  () => EmployeeChevronRightIcon(),
  () => EmployeePlusIcon(),
  () => EmployeeCheckSmallIcon(),
  () => EmployeeBigCheckIcon(),
  () => EmployeeLocationPinIcon(),
  () => EmployeeKeyIcon(),
  () => EmployeeCameraSquareIcon(),
  () => EmployeeAlertIcon(),
  () => EmployeeSearchIcon(),
] as const;

describe("Employee icon foundation", () => {
  it("reuses every canonical Web path without Native path approximation", () => {
    const webSource = readFileSync(
      resolve(
        import.meta.dirname,
        "../../valet/src/components/icons/employee-icons.tsx",
      ),
      "utf8",
    );
    const paths = canonicalIcons.flatMap((icon) =>
      elements(icon()).filter((node) => node.type === "Path"),
    );

    expect(paths).toHaveLength(18);
    for (const path of paths) {
      expect(webSource).toContain(`d="${String(path.props.d)}"`);
    }
  });

  it.each([
    ["Home", () => EmployeeHomeIcon({}), 22, "0 0 22 22"],
    ["Car", () => EmployeeCarIcon({}), 22, "0 0 22 22"],
    ["Scan", () => EmployeeScanIcon({}), 22, "0 0 22 22"],
    ["Shift", () => EmployeeShiftIcon({}), 22, "0 0 22 22"],
    ["Back", () => EmployeeChevronLeftIcon(), 24, "0 0 24 24"],
    ["Forward", () => EmployeeChevronRightIcon(), 16, "0 0 16 16"],
    ["Plus", () => EmployeePlusIcon(), 14, "0 0 14 14"],
    ["Check", () => EmployeeCheckSmallIcon(), 12, "0 0 12 12"],
    ["Big check", () => EmployeeBigCheckIcon(), 36, "0 0 36 36"],
    ["Location", () => EmployeeLocationPinIcon(), 14, "0 0 14 14"],
    ["Key", () => EmployeeKeyIcon(), 14, "0 0 14 14"],
    ["Camera", () => EmployeeCameraSquareIcon(), 28, "0 0 28 28"],
    ["Alert", () => EmployeeAlertIcon(), 32, "0 0 32 32"],
    ["Search", () => EmployeeSearchIcon(), 16, "0 0 16 16"],
  ])("preserves the %s intrinsic geometry", (_name, icon, size, viewBox) => {
    const svg = elements(icon())[0]!;
    expect(svg.type).toBe("Svg");
    expect(svg.props).toMatchObject({ height: size, viewBox, width: size });
  });

  it("uses the Web person concept for Shift and honors color/size inputs", () => {
    const shift = elements(EmployeeShiftIcon({ active: true, size: 31 }));
    expect(shift[0]!.props).toMatchObject({
      height: 31,
      viewBox: "0 0 22 22",
      width: 31,
    });
    expect(shift.find((node) => node.type === "Circle")?.props).toMatchObject({
      cx: 11,
      cy: 8,
      r: 3.5,
      stroke: employeeColors.blue,
      strokeWidth: 1.6,
    });
    expect(shift.find((node) => node.type === "Path")?.props).toMatchObject({
      d: "M4 19c0-3.866 3.134-7 7-7s7 3.134 7 7",
      stroke: employeeColors.blue,
      strokeLinecap: "round",
    });

    const scanPath = elements(EmployeeScanIcon({ inverse: true })).find(
      (node) => node.type === "Path",
    )!;
    expect(scanPath.props.stroke).toBe(employeeColors.white);
    const customPath = elements(EmployeeHomeIcon({ color: "#123456" })).find(
      (node) => node.type === "Path",
    )!;
    expect(customPath.props.stroke).toBe("#123456");
  });

  it("preserves canonical non-path geometry and stroke/fill treatment", () => {
    const car = elements(EmployeeCarIcon({}));
    expect(car.find((node) => node.type === "Rect")?.props).toMatchObject({
      height: 7,
      rx: 2,
      stroke: employeeColors.neutral,
      strokeWidth: 1.6,
      width: 18,
      x: 2,
      y: 10,
    });
    expect(
      car.filter((node) => node.type === "Circle").map((node) => node.props),
    ).toEqual([
      { cx: 6, cy: 17, fill: employeeColors.neutral, r: 1.5 },
      { cx: 16, cy: 17, fill: employeeColors.neutral, r: 1.5 },
    ]);

    expect(
      elements(EmployeeCameraSquareIcon()).find(
        (node) => node.type === "Circle",
      )?.props,
    ).toMatchObject({ cx: 14, cy: 15, r: 4, strokeWidth: 1.6 });
    expect(
      elements(EmployeeKeyIcon()).find((node) => node.type === "Circle")?.props,
    ).toMatchObject({ cx: 5, cy: 6, r: 3.5, strokeWidth: 1.25 });
    expect(
      elements(EmployeeSearchIcon()).find((node) => node.type === "Circle")
        ?.props,
    ).toMatchObject({ cx: 7, cy: 7, r: 5.5, strokeWidth: 1.25 });

    const locationPaths = elements(EmployeeLocationPinIcon()).filter(
      (node) => node.type === "Path",
    );
    expect(locationPaths[0]!.props).toMatchObject({
      d: "M7 7a2 2 0 100-4 2 2 0 000 4z",
      fill: employeeColors.white,
    });
    expect(locationPaths[1]!.props).toMatchObject({
      fill: "none",
      stroke: employeeColors.white,
      strokeWidth: 1.25,
    });
  });

  it("keeps directional geometry explicit and does not auto-mirror Back", () => {
    const ltr = elements(EmployeeBackIcon({ direction: "ltr" }));
    const rtl = elements(EmployeeBackIcon({ direction: "rtl" }));

    expect(rtl).toEqual(ltr);
    expect(rtl[1]!.props).toMatchObject({
      d: "M15 18l-6-6 6-6",
      strokeLinecap: "round",
      strokeLinejoin: "round",
      strokeWidth: 1.75,
    });
    expect(rtl[1]!.props).not.toHaveProperty("transform");
  });
});

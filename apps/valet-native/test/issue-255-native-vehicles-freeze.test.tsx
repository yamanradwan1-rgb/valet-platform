import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  NativeVehicleRow,
  getNativeVehiclesCopy,
  vehicleElements,
  vehicleRow,
  vehicleWindow,
  EmployeeButton,
} from "./native-vehicles-test-fixture";
import { NativeCheckInCancelSheet } from "../src/vehicles/native-check-in-cancel-sheet";
import { freezeTree } from "./issue-255-freeze-tree";
import { NativeVehicleCheckInActions } from "../src/vehicles/native-vehicle-check-in-actions";
import { nativeCheckInActionsCopy } from "../src/vehicles/native-check-in-actions-copy";
import { getNativeEmployeeDictionary } from "../src/i18n/native-employee-dictionary";

const baseline = JSON.parse(
  readFileSync(
    new URL("./fixtures/issue-255-native-row-baseline.json", import.meta.url),
    "utf8",
  ),
) as { baselineSha: string; cases: Record<string, string> };
const digest = (tree: unknown) =>
  createHash("sha256")
    .update(JSON.stringify(freezeTree(tree)))
    .digest("hex");
describe("Issue #255 frozen Native Vehicles render boundary", () => {
  it("matches actual baseline trees across all eight active states, EN/AR and collapsed/expanded", () => {
    expect(baseline.baselineSha).toBe(
      "2ce32445a289ed803366834fa8e1f7e80ab20818",
    );
    for (const locale of ["en", "ar"] as const)
      for (const state of [
        "CHECKING_IN",
        "AWAITING_PARKING",
        "PARKING",
        "PARKED",
        "REQUESTED",
        "RETRIEVING",
        "READY",
        "HANDOFF_PENDING",
      ] as const)
        for (const expanded of [false, true]) {
          const props = {
            copy: getNativeVehiclesCopy(locale),
            expanded,
            locale,
            onToggle: vi.fn(),
            row: { ...vehicleRow, state },
            textAlign: locale === "ar" ? ("right" as const) : ("left" as const),
          };
          expect(digest(NativeVehicleRow(props))).toBe(
            baseline.cases[`${locale}:${state}:${expanded}`],
          );
          // Non-Check-In and collapsed rows ignore any action slot entirely.
          if (!expanded || state !== "CHECKING_IN")
            expect(
              digest(NativeVehicleRow({ ...props, checkInActions: <></> })),
            ).toBe(baseline.cases[`${locale}:${state}:${expanded}`]);
        }
  });
  it("changes only the existing affected expanded-row footer", () => {
    const props = {
      copy: getNativeVehiclesCopy("en"),
      expanded: true,
      locale: "en" as const,
      onToggle: vi.fn(),
      row: { ...vehicleRow, state: "CHECKING_IN" as const },
      textAlign: "left" as const,
    };
    const before = freezeTree(NativeVehicleRow(props)) as {
      props: { children: unknown[] };
    };
    const after = freezeTree(
      NativeVehicleRow({
        ...props,
        checkInActions: <div>Permitted actions</div>,
      }),
    ) as typeof before;
    const beforeDetails = before.props.children[1] as {
      props: { children: unknown[] };
    };
    const afterDetails = after.props.children[1] as typeof beforeDetails;
    expect(after.props.children[0]).toEqual(before.props.children[0]);
    expect(afterDetails.props.children.slice(0, -1)).toEqual(
      beforeDetails.props.children.slice(0, -1),
    );
  });
  it("uses central EN/AR copy and scalable vertically stacked existing controls for narrow large-text layouts", () => {
    expect(Object.keys(getNativeEmployeeDictionary("ar")).sort()).toEqual(
      Object.keys(getNativeEmployeeDictionary("en")).sort(),
    );
    for (const locale of ["en", "ar"] as const)
      for (const fontScale of [1, 1.5, 2]) {
        vehicleWindow.fontScale = fontScale;
        vehicleWindow.width = 320;
        const copy = nativeCheckInActionsCopy(locale);
        const nodes = vehicleElements(
          NativeVehicleCheckInActions({
            copy,
            phase: "inactive",
            disabled: false,
            onContinue: vi.fn(),
            onCancel: vi.fn(),
            onCheck: vi.fn(),
            onRetry: vi.fn(),
            textAlign: locale === "ar" ? "right" : "left",
          }),
        );
        const buttons = nodes.filter((node) => node.type === EmployeeButton);
        expect(buttons.map((node) => node.props.label)).toEqual([
          copy.continue,
          copy.cancel,
        ]);
        expect(
          buttons.every((node) => Number(node.props.height) >= 64 * fontScale),
        ).toBe(true);
        expect(JSON.stringify(nodes[0]?.props.style)).toBe('{"gap":12}');
        expect(JSON.stringify(nodes)).not.toContain(vehicleRow.sessionId);
      }
    vehicleWindow.fontScale = 1;
  });
  it("unknown recovery has one safe-read action and blocks Continue and another Cancel", () => {
    const nodes = vehicleElements(
      NativeVehicleCheckInActions({
        copy: nativeCheckInActionsCopy("en"),
        phase: "unknown",
        disabled: false,
        onContinue: vi.fn(),
        onCancel: vi.fn(),
        onCheck: vi.fn(),
        onRetry: vi.fn(),
        textAlign: "left",
      }),
    );
    const buttons = nodes.filter((node) => node.type === EmployeeButton);
    expect(buttons.map((node) => node.props.disabled)).toEqual([
      true,
      true,
      false,
    ]);
  });
  it("keeps confirmation accessible, RTL-aware and disabled while offline or authority is unavailable", () => {
    for (const locale of ["en", "ar"] as const) {
      const copy = nativeCheckInActionsCopy(locale);
      const nodes = vehicleElements(
        NativeCheckInCancelSheet({
          body: copy.body,
          cancel: copy.keep,
          confirm: copy.cancel,
          disabled: true,
          onClose: vi.fn(),
          onConfirm: vi.fn(),
          title: copy.title,
          textAlign: locale === "ar" ? "right" : "left",
          variant: "danger",
        }),
      );
      const buttons = nodes.filter((node) => node.type === EmployeeButton);
      expect(buttons[0]?.props.disabled).toBe(true);
      expect(buttons[0]?.props.label).toBe(copy.cancel);
      expect(
        nodes.some((node) => node.props.accessibilityViewIsModal === true),
      ).toBe(true);
      expect(
        nodes.some(
          (node) =>
            node.props.accessibilityLabel === copy.title &&
            JSON.stringify(node.props.style).includes(
              locale === "ar" ? "rtl" : "ltr",
            ),
        ),
      ).toBe(true);
    }
  });
});

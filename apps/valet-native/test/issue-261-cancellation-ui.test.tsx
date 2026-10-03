import { describe, expect, it, vi } from "vitest";
import {
  appearanceRenderer,
  appearanceGeometry,
} from "./appearance-render-evidence";
import { appearanceNodes } from "./appearance-render-tree";
import { employeePalettes } from "../src/appearance/employee-palette";
import { getNativeParkingCancellationCopy } from "../src/parking/native-parking-cancellation-copy";
import { detail } from "./native-parity-11-test-fixture";
import { scope } from "./production-shell-test-fixture";

const parking = {
  phase: "accepted",
  identityGeneration: 7,
  scope,
  session: {
    ...detail(),
    state: "AWAITING_PARKING",
    parking: { parkingStartedAt: null },
  },
  task: { taskId: "task", version: 3 },
};
function render(
  mode: "light" | "dark",
  locale: "en" | "ar",
  phase = "idle",
  snapshot = parking,
) {
  const controller = {
    current: () => ({ phase, target: null }),
    subscribe: vi.fn(),
    confirm: vi.fn(),
    dismiss: vi.fn(),
    submit: vi.fn(),
    retry: vi.fn(),
    checkServerState: vi.fn(),
  };
  const tree = appearanceRenderer(mode).render(
    "parking/native-parking-cancellation-controls",
    "NativeParkingCancellationControls",
    {
      session: controller,
      parking: snapshot,
      locale,
      onCancelled: vi.fn(),
      onBack: vi.fn(),
    },
    false,
    true,
  );
  return { tree, nodes: appearanceNodes(tree), controller };
}
function button(nodes: ReturnType<typeof appearanceNodes>, label: string) {
  return nodes.find(
    (n) => n.type === "Pressable" && n.props.accessibilityLabel === label,
  )!;
}
describe("Issue #261 minimal pre-start cancellation UI", () => {
  it.each(["en", "ar"] as const)(
    "uses accessible labels, exact confirmation and RTL in %s",
    (locale) => {
      const copy = getNativeParkingCancellationCopy(locale);
      for (const mode of ["light", "dark"] as const) {
        const idle = render(mode, locale);
        const cancel = button(idle.nodes, copy.cancelService);
        expect(cancel.props.accessibilityRole).toBe("button");
        (cancel.props.onPress as () => void)();
        expect(idle.controller.confirm).toHaveBeenCalledExactlyOnceWith(
          expect.objectContaining({
            taskId: "task",
            expectedTaskVersion: 3,
            expectedShiftId: scope.shiftId,
          }),
        );
        const confirmation = render(mode, locale, "confirming");
        expect(
          confirmation.nodes.find((n) => n.type === "Modal")?.props.visible,
        ).toBe(true);
        const sheet = confirmation.nodes.find(
          (n) => n.props.accessibilityRole === "summary",
        )!;
        expect(sheet.props.accessibilityLabel).toBe(copy.title);
        expect(sheet.props.accessible).not.toBe(true);
        expect(
          confirmation.nodes.find(
            (n) =>
              n.type === "Text" &&
              n.props.accessibilityLabel === `${copy.title}. ${copy.body}`,
          )?.props.accessible,
        ).toBe(true);
        expect(sheet.props.style).toMatchObject({
          direction: locale === "ar" ? "rtl" : "ltr",
        });
        const confirm = button(confirmation.nodes, copy.confirm);
        expect(confirm.props.style).toMatchObject({
          backgroundColor: employeePalettes[mode].actionDanger,
        });
        (confirm.props.onPress as () => void)();
        expect(confirmation.controller.submit).toHaveBeenCalledOnce();
        (
          button(confirmation.nodes, copy.dismiss).props.onPress as () => void
        )();
        expect(confirmation.controller.dismiss).toHaveBeenCalledOnce();
      }
    },
  );
  it.each(["submitting", "reconciling"])(
    "blocks duplicate activation while %s",
    (phase) => {
      const { nodes, controller } = render("dark", "ar", phase);
      const busy = button(
        nodes,
        getNativeParkingCancellationCopy("ar").cancelling,
      );
      expect(busy.props.accessibilityState).toMatchObject({
        disabled: true,
        busy: true,
      });
      (busy.props.onPress as () => void)();
      expect(controller.checkServerState).not.toHaveBeenCalled();
      expect(controller.submit).not.toHaveBeenCalled();
    },
  );
  it("offers read-only unknown recovery and explicit retry confirmation", () => {
    const copy = getNativeParkingCancellationCopy("en");
    const unknown = render("light", "en", "uncertain");
    (button(unknown.nodes, copy.checkState).props.onPress as () => void)();
    expect(unknown.controller.checkServerState).toHaveBeenCalledOnce();
    expect(unknown.controller.submit).not.toHaveBeenCalled();
    const retry = render("light", "en", "retry");
    (button(retry.nodes, copy.retry).props.onPress as () => void)();
    expect(retry.controller.retry).toHaveBeenCalledOnce();
    expect(retry.controller.submit).not.toHaveBeenCalled();
  });
  it("hides cancellation after physical custody and keeps Light/Dark geometry identical", () => {
    const progressed = {
      ...parking,
      phase: "started",
      session: {
        ...parking.session,
        state: "PARKING",
        parking: { parkingStartedAt: "2026-10-03T10:00:00Z" },
      },
    };
    expect(render("light", "en", "idle", progressed).nodes).toEqual([]);
    for (const phase of [
      "idle",
      "confirming",
      "uncertain",
      "submitting",
      "conflict",
    ]) {
      expect(
        appearanceGeometry(
          JSON.parse(JSON.stringify(render("light", "ar", phase).tree)),
        ),
      ).toEqual(
        appearanceGeometry(
          JSON.parse(JSON.stringify(render("dark", "ar", phase).tree)),
        ),
      );
    }
  });
});

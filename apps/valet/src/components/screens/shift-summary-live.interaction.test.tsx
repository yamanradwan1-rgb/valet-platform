import type { ReactElement, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ResolvedOperationalScope } from "../../features/staff-operational-context";
import type { EndShiftPhase } from "../../features/shift";
import { employeeDictionary } from "../../lib/i18n/dictionary";

type StateUpdate<T> = T | ((current: T) => T);
type RefCell = { current: unknown };

class HookRuntime {
  private stateCursor = 0;
  private refCursor = 0;
  private readonly state: unknown[] = [];
  readonly refs: RefCell[] = [];

  beginRender(): void {
    this.stateCursor = 0;
    this.refCursor = 0;
  }

  reset(): void {
    this.state.length = 0;
    this.refs.length = 0;
    this.beginRender();
  }

  useState<T>(initial: T | (() => T)): [T, (update: StateUpdate<T>) => void] {
    const index = this.stateCursor++;
    if (index >= this.state.length) {
      this.state[index] = typeof initial === "function"
        ? (initial as () => T)()
        : initial;
    }
    return [
      this.state[index] as T,
      (update) => {
        const current = this.state[index] as T;
        this.state[index] = typeof update === "function"
          ? (update as (value: T) => T)(current)
          : update;
      },
    ];
  }

  useRef<T>(initial: T): { current: T } {
    const index = this.refCursor++;
    if (index >= this.refs.length) this.refs[index] = { current: initial };
    return this.refs[index] as { current: T };
  }
}

const runtime = new HookRuntime();
let online = true;
let locale: "ar" | "en" = "en";

vi.doMock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");
  return {
    ...actual,
    useEffect: () => undefined,
    useRef: <T,>(initial: T) => runtime.useRef(initial),
    useState: <T,>(initial: T | (() => T)) => runtime.useState(initial),
  };
});

vi.doMock("../../lib/connectivity/use-online-status", () => ({
  useOnlineStatus: () => online,
}));

vi.doMock("../shell/employee-i18n", () => ({
  useEmployeeI18n: () => ({
    dir: locale === "ar" ? "rtl" : "ltr",
    locale,
    setLocale: () => undefined,
    t: employeeDictionary(locale),
  }),
}));

const React = await import("react");
const { ShiftSummaryLive } = await import("./shift-summary-live");

const SCOPE: ResolvedOperationalScope = {
  activeContext: {} as ResolvedOperationalScope["activeContext"],
  currency: "JOD",
  locationCode: "AMM-01",
  locationId: "22222222-2222-4222-8222-222222222222",
  locationName: "Amman Ridge Hotel",
  membershipId: "33333333-3333-4333-8333-333333333333",
  organizationId: "44444444-4444-4444-8444-444444444444",
  organizationName: "VAYLET Operations",
  role: "VALET_EMPLOYEE",
  shiftId: "55555555-5555-4555-8555-555555555555",
  shiftStartedAt: "2026-08-25T10:00:00.000Z",
};

type ElementProps = Record<string, unknown>;
type TreeElement = ReactElement<ElementProps>;

function elementsIn(node: ReactNode): TreeElement[] {
  if (Array.isArray(node)) return node.flatMap(elementsIn);
  if (!React.isValidElement<ElementProps>(node)) return [];
  return [node, ...elementsIn(node.props.children as ReactNode)];
}

function findByLabel(tree: ReactNode, label: string): TreeElement {
  const found = elementsIn(tree).find((element) => element.props.label === label);
  if (found === undefined) throw new Error(`Missing action: ${label}`);
  return found;
}

function findInput(tree: ReactNode): TreeElement {
  const found = elementsIn(tree).find((element) => element.type === "input");
  if (found === undefined) throw new Error("Missing cash input");
  return found;
}

function textIn(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textIn).join("");
  if (!React.isValidElement<ElementProps>(node)) return "";
  return textIn(node.props.children as ReactNode);
}

function renderScreen(options: {
  endShift?: (shiftId: string, cashReported: string) => void;
  phase?: EndShiftPhase;
} = {}): ReactNode {
  runtime.beginRender();
  return ShiftSummaryLive({
    endShift: options.endShift ?? vi.fn(),
    endShiftPhase: options.phase ?? { kind: "idle" },
    retryUncertainEndShift: vi.fn(),
    scope: SCOPE,
  });
}

function changeCash(tree: ReactNode, value: string): void {
  const onChange = findInput(tree).props.onChange as
    | ((event: { target: { value: string } }) => void)
    | undefined;
  onChange?.({ target: { value } });
}

function clickAction(tree: ReactNode, label: string): void {
  const action = findByLabel(tree, label);
  expect(action.props.disabled).not.toBe(true);
  (action.props.onClick as (() => void) | undefined)?.();
}

describe("Issue #200 End Shift interaction", () => {
  beforeEach(() => {
    runtime.reset();
    online = true;
    locale = "en";
  });

  it.each(["", "-1", "cash", "1.0000"])(
    "routes invalid cash %j to accessible validation without confirmation or mutation",
    (cashInput) => {
      const endShift = vi.fn();
      let tree = renderScreen({ endShift });
      if (cashInput !== "") {
        changeCash(tree, cashInput);
        tree = renderScreen({ endShift });
      }
      const focus = vi.fn();
      if (runtime.refs[0] !== undefined) runtime.refs[0].current = { focus };

      clickAction(tree, "End Shift");
      tree = renderScreen({ endShift });

      const input = findInput(tree);
      expect(textIn(tree)).toContain("Enter a valid non-negative cash amount");
      expect(input.props["aria-invalid"]).toBe(true);
      expect(input.props["aria-describedby"]).toContain("cash-reported-error");
      expect(focus).toHaveBeenCalledOnce();
      expect(textIn(tree)).not.toContain("End this shift now?");
      expect(endShift).not.toHaveBeenCalled();
    },
  );

  it.each(["0", "0.000"])(
    "opens confirmation for valid cash %s and submits exactly once after confirm",
    (cashInput) => {
      const endShift = vi.fn();
      let tree = renderScreen({ endShift });
      if (cashInput === "0") {
        clickAction(tree, "End Shift");
        tree = renderScreen({ endShift });
        expect(textIn(tree)).toContain("Enter a valid non-negative cash amount");
      }
      changeCash(tree, cashInput);
      tree = renderScreen({ endShift });
      expect(textIn(tree)).not.toContain("Enter a valid non-negative cash amount");

      clickAction(tree, "End Shift");
      tree = renderScreen({ endShift });
      expect(textIn(tree)).toContain("End this shift now?");
      expect(endShift).not.toHaveBeenCalled();

      clickAction(tree, "Confirm end shift");
      expect(endShift).toHaveBeenCalledOnce();
      expect(endShift).toHaveBeenCalledWith(SCOPE.shiftId, cashInput);
    },
  );

  it("cancels confirmation without sending a request", () => {
    const endShift = vi.fn();
    let tree = renderScreen({ endShift });
    changeCash(tree, "12.500");
    tree = renderScreen({ endShift });
    clickAction(tree, "End Shift");
    tree = renderScreen({ endShift });
    clickAction(tree, "Cancel");
    tree = renderScreen({ endShift });

    expect(textIn(tree)).not.toContain("End this shift now?");
    expect(endShift).not.toHaveBeenCalled();
  });

  it("keeps offline, submitting, and uncertain actions locked", () => {
    online = false;
    let tree = renderScreen();
    expect(findByLabel(tree, "End Shift").props.disabled).toBe(true);

    online = true;
    tree = renderScreen({ phase: { kind: "submitting" } });
    expect(findByLabel(tree, "Ending shift...").props.disabled).toBe(true);

    tree = renderScreen({
      phase: { cashReported: "0", kind: "uncertain", shiftId: SCOPE.shiftId },
    });
    expect(findByLabel(tree, "End Shift").props.disabled).toBe(true);
  });

  it("renders localized Arabic validation while keeping the amount field LTR", () => {
    locale = "ar";
    let tree = renderScreen();
    const focus = vi.fn();
    if (runtime.refs[0] !== undefined) runtime.refs[0].current = { focus };
    clickAction(tree, "إنهاء المناوبة");
    tree = renderScreen();

    expect(textIn(tree)).toContain("أدخل مبلغًا نقديًا صالحًا غير سالب");
    expect(findInput(tree).props.dir).toBe("ltr");
    expect(focus).toHaveBeenCalledOnce();
  });
});

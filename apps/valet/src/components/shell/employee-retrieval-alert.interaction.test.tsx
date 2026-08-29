import type { ReactElement, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

type StateUpdate<T> = T | ((current: T) => T);

class HookRuntime {
  private stateCursor = 0;
  private refCursor = 0;
  private readonly state: unknown[] = [];
  private readonly refs: { current: unknown }[] = [];

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

vi.doMock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");
  return {
    ...actual,
    useRef: <T,>(initial: T) => runtime.useRef(initial),
    useState: <T,>(initial: T | (() => T)) => runtime.useState(initial),
  };
});

const React = await import("react");
const { RetrievalAlertBanner } = await import("./employee-retrieval-alert");

const TASK_ID_A = "11111111-1111-4111-8111-111111111111";
const TASK_ID_B = "22222222-2222-4222-8222-222222222222";

type TreeElement = ReactElement<Record<string, unknown>>;

function elementsIn(node: ReactNode): TreeElement[] {
  if (Array.isArray(node)) return node.flatMap(elementsIn);
  if (!React.isValidElement<Record<string, unknown>>(node)) return [];
  return [node, ...elementsIn(node.props.children as ReactNode)];
}

function textIn(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textIn).join("");
  if (!React.isValidElement<Record<string, unknown>>(node)) return "";
  return textIn(node.props.children as ReactNode);
}

function renderCard(options: {
  onDismiss: (taskId: string) => void;
  onOpenTask: (taskId: string) => void;
  taskId?: string;
}): TreeElement {
  runtime.beginRender();
  return RetrievalAlertBanner({
    body: "A guest has requested their vehicle.",
    dismissLabel: "Dismiss",
    onDismiss: options.onDismiss,
    onOpenTask: options.onOpenTask,
    taskId: options.taskId ?? TASK_ID_A,
    title: "Vehicle requested",
  });
}

function pointerEvent(
  pointerId: number,
  clientX: number,
  clientY: number,
  overrides: Record<string, unknown> = {},
) {
  return {
    button: 0,
    clientX,
    clientY,
    currentTarget: {
      releasePointerCapture: vi.fn(),
      setPointerCapture: vi.fn(),
    },
    isPrimary: true,
    pointerId,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    ...overrides,
  };
}

function invoke(
  tree: TreeElement,
  handler: string,
  event: ReturnType<typeof pointerEvent>,
): void {
  (tree.props[handler] as ((value: typeof event) => void) | undefined)?.(event);
}

function buttonWithLabel(tree: TreeElement, label: string): TreeElement {
  const button = elementsIn(tree).find(
    (element) =>
      element.type === "button" &&
      (element.props["aria-label"] === label || textIn(element).includes(label)),
  );
  if (button === undefined) throw new Error(`Missing button: ${label}`);
  return button;
}

describe("Employee retrieval alert pointer interaction", () => {
  beforeEach(() => {
    runtime.reset();
    vi.useFakeTimers();
  });

  it("dismisses an upward swipe without navigating", () => {
    const onDismiss = vi.fn();
    const onOpenTask = vi.fn();
    let tree = renderCard({ onDismiss, onOpenTask });
    invoke(tree, "onPointerDown", pointerEvent(1, 10, 100));
    invoke(tree, "onPointerMove", pointerEvent(1, 14, 40));
    tree = renderCard({ onDismiss, onOpenTask });
    invoke(tree, "onPointerUp", pointerEvent(1, 14, 40));

    const navigationClick = pointerEvent(1, 14, 40);
    (buttonWithLabel(tree, "Vehicle requested").props.onClick as
      | ((event: typeof navigationClick) => void)
      | undefined)?.(navigationClick);

    expect(onDismiss).toHaveBeenCalledWith(TASK_ID_A);
    expect(onOpenTask).not.toHaveBeenCalled();
  });

  it("keeps a normal tap navigable", () => {
    const onDismiss = vi.fn();
    const onOpenTask = vi.fn();
    const tree = renderCard({ onDismiss, onOpenTask });
    invoke(tree, "onPointerDown", pointerEvent(1, 10, 100));
    invoke(tree, "onPointerUp", pointerEvent(1, 11, 99));
    const navigationClick = pointerEvent(1, 11, 99);
    (buttonWithLabel(tree, "Vehicle requested").props.onClick as
      | ((event: typeof navigationClick) => void)
      | undefined)?.(navigationClick);

    expect(onOpenTask).toHaveBeenCalledWith(TASK_ID_A);
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("cancels safely on pointercancel", () => {
    const onDismiss = vi.fn();
    const onOpenTask = vi.fn();
    const tree = renderCard({ onDismiss, onOpenTask });
    invoke(tree, "onPointerDown", pointerEvent(1, 10, 100));
    invoke(tree, "onPointerMove", pointerEvent(1, 10, 20));
    invoke(tree, "onPointerCancel", pointerEvent(1, 10, 20));
    const navigationClick = pointerEvent(1, 10, 20);
    (buttonWithLabel(tree, "Vehicle requested").props.onClick as
      | ((event: typeof navigationClick) => void)
      | undefined)?.(navigationClick);
    expect(onDismiss).not.toHaveBeenCalled();
    expect(onOpenTask).not.toHaveBeenCalled();
  });

  it("cancels on lost capture and multi-pointer interference", () => {
    const onDismiss = vi.fn();
    let tree = renderCard({ onDismiss, onOpenTask: vi.fn() });
    invoke(tree, "onPointerDown", pointerEvent(1, 10, 100));
    invoke(tree, "onPointerMove", pointerEvent(1, 10, 80));
    invoke(tree, "onLostPointerCapture", pointerEvent(1, 10, 80));
    expect(onDismiss).not.toHaveBeenCalled();

    runtime.reset();
    tree = renderCard({ onDismiss, onOpenTask: vi.fn() });
    invoke(tree, "onPointerDown", pointerEvent(1, 10, 100));
    invoke(
      tree,
      "onPointerDown",
      pointerEvent(2, 10, 90, { isPrimary: false }),
    );
    invoke(tree, "onPointerUp", pointerEvent(1, 10, 20));
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("uses an explicit accessible dismiss action independently per alert", () => {
    const onDismiss = vi.fn();
    const onOpenTask = vi.fn();
    let tree = renderCard({ onDismiss, onOpenTask, taskId: TASK_ID_A });
    const dismissEvent = pointerEvent(1, 0, 0);
    (buttonWithLabel(tree, "Dismiss").props.onClick as
      | ((event: typeof dismissEvent) => void)
      | undefined)?.(dismissEvent);

    runtime.reset();
    tree = renderCard({ onDismiss, onOpenTask, taskId: TASK_ID_B });
    (buttonWithLabel(tree, "Dismiss").props.onClick as
      | ((event: typeof dismissEvent) => void)
      | undefined)?.(dismissEvent);

    expect(onDismiss.mock.calls).toEqual([[TASK_ID_A], [TASK_ID_B]]);
    expect(onOpenTask).not.toHaveBeenCalled();
  });

  it("disables gesture motion in CSS without blocking dismissal", () => {
    const onDismiss = vi.fn();
    let tree = renderCard({ onDismiss, onOpenTask: vi.fn() });
    invoke(tree, "onPointerDown", pointerEvent(1, 10, 100));
    invoke(tree, "onPointerMove", pointerEvent(1, 10, 40));
    tree = renderCard({ onDismiss, onOpenTask: vi.fn() });
    expect(tree.props.className).toContain("motion-reduce:transform-none");
    expect(tree.props.className).toContain("motion-reduce:opacity-100");
    invoke(tree, "onPointerUp", pointerEvent(1, 10, 40));
    expect(onDismiss).toHaveBeenCalledOnce();
  });
});

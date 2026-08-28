import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../i18n/locale-provider", () => ({
  useTranslation: () => ({ t: () => "Close" }),
}));

import { installMinimalBrowser } from "../../features/map-setup/setup-map.integration.test-double";
import { ListDetailSheet } from "./list-detail-sheet";

type ElementLike = HTMLElement & { childNodes: ElementLike[] };
let restore: () => void = () => undefined;

function descendants(root: ElementLike): ElementLike[] {
  return root.childNodes.flatMap((child) => [child, ...descendants(child)]);
}

function byAttribute(name: string, value: string): ElementLike {
  const found = descendants(document.body as unknown as ElementLike).find(
    (element) => element.getAttribute(name) === value,
  );
  if (found === undefined) throw new Error(`Missing ${name}=${value}`);
  return found;
}

function keydown(key: string, shiftKey = false): void {
  window.dispatchEvent(Object.assign(new Event("keydown"), { key, shiftKey }));
}

describe("ListDetailSheet modal behavior", () => {
  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    restore = installMinimalBrowser();
  });

  afterEach(() => {
    restore();
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;
  });

  it("portals, traps focus, closes once, and restores shell and opener", () => {
    const shell = document.createElement("div");
    shell.className = "dashboard-shell";
    const opener = document.createElement("button");
    const container = document.createElement("div");
    shell.appendChild(opener);
    shell.appendChild(container);
    document.body.appendChild(shell);
    opener.focus();
    const onClose = vi.fn();
    const root = createRoot(container);
    act(() => {
      root.render(
        <ListDetailSheet title="Vehicle details" onClose={onClose}>
          <button type="button">First</button>
          <button type="button">Last</button>
        </ListDetailSheet>,
      );
    });

    const dialog = byAttribute("role", "dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.getAttribute("aria-label")).toBe("Vehicle details");
    expect(shell.contains(dialog)).toBe(false);
    expect(shell.inert).toBe(true);
    expect(dialog.contains(document.activeElement)).toBe(true);

    const controls = Array.from(
      dialog.querySelectorAll<HTMLElement>("button:not([disabled])"),
    );
    controls.at(-1)!.focus();
    keydown("Tab");
    expect(document.activeElement).toBe(controls[0]);
    controls[0]!.focus();
    keydown("Tab", true);
    expect(document.activeElement).toBe(controls.at(-1));
    keydown("Escape");
    expect(onClose).toHaveBeenCalledTimes(1);

    act(() => root.unmount());
    expect(shell.inert).toBe(false);
    expect(document.activeElement).toBe(opener);
  });
});

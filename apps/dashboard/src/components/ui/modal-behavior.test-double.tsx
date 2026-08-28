import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";

import { installMinimalBrowser } from "../../features/map-setup/setup-map.integration.test-double";

export type TestElement = HTMLElement & { childNodes: TestElement[] };

export interface ModalHarness {
  readonly opener: HTMLElement;
  readonly root: Root;
  readonly shell: HTMLElement;
  cleanup: () => void;
}

export function descendants(root: TestElement): TestElement[] {
  return root.childNodes.flatMap((child) => [child, ...descendants(child)]);
}

export function findAttribute(name: string, value: string): TestElement {
  const found = descendants(document.body as unknown as TestElement).find(
    (element) => element.getAttribute(name) === value,
  );
  if (found === undefined) throw new Error(`Missing ${name}=${value}`);
  return found;
}

export function pressKey(key: string, shiftKey = false): void {
  window.dispatchEvent(Object.assign(new Event("keydown"), { key, shiftKey }));
}

export function mountModal(node: ReactNode): ModalHarness {
  const shell = document.createElement("div");
  shell.className = "dashboard-shell";
  const opener = document.createElement("button");
  const container = document.createElement("div");
  shell.appendChild(opener);
  shell.appendChild(container);
  document.body.appendChild(shell);
  opener.focus();
  const root = createRoot(container);
  act(() => root.render(node));
  return {
    opener,
    root,
    shell,
    cleanup() {
      act(() => root.unmount());
    },
  };
}

export function installModalBrowser(): () => void {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const restore = installMinimalBrowser();
  return () => {
    restore();
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;
  };
}

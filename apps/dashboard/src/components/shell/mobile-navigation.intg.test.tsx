import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const route = vi.hoisted(() => ({ pathname: "/overview" }));

vi.mock("next/navigation", () => ({ usePathname: () => route.pathname }));
vi.mock("next/link", () => ({
  default: ({
    href,
    onClick,
    children,
    ...props
  }: {
    href: string;
    onClick?: () => void;
    children: ReactNode;
  } & Record<string, unknown>) => (
    <a href={href} {...(onClick === undefined ? {} : { onClick })} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("../../features/auth/use-auth", () => ({
  useAuth: () => ({
    session: { email: "manager@vaylet.test" },
    signOut: vi.fn(),
  }),
}));
vi.mock("../../theme/theme-provider", () => ({
  useTheme: () => ({ theme: "light", toggleTheme: vi.fn() }),
}));
vi.mock("../../i18n/locale-provider", () => ({
  useTranslation: () => ({
    locale: "en",
    setLocale: vi.fn(),
    t: (key: string) => key,
  }),
}));
vi.mock("./location-switcher", () => ({ LocationSwitcher: () => <div /> }));

import { installMinimalBrowser } from "../../features/map-setup/setup-map.integration.test-double";
import { AppShell } from "./app-shell";
import {
  MOBILE_NAVIGATION_DRAWER_ID,
  MobileNavigationDrawer,
} from "./mobile-navigation-drawer";

type TestElement = HTMLElement & { childNodes: TestElement[] };
let restore: () => void = () => undefined;
let root: Root;

function descendants(element: TestElement): TestElement[] {
  return element.childNodes.flatMap((child) => [child, ...descendants(child)]);
}

function findAttribute(name: string, value: string): TestElement {
  const result = descendants(document.body as unknown as TestElement).find(
    (element) => element.getAttribute(name) === value,
  );
  if (result === undefined) throw new Error(`Missing ${name}=${value}`);
  return result;
}

function maybeAttribute(name: string, value: string): TestElement | undefined {
  return descendants(document.body as unknown as TestElement).find(
    (element) => element.getAttribute(name) === value,
  );
}

function click(element: HTMLElement): void {
  act(() => element.dispatchEvent(new Event("click", { bubbles: true })));
}

function pressKey(key: string, shiftKey = false): void {
  act(() =>
    window.dispatchEvent(
      Object.assign(new Event("keydown"), { key, shiftKey }),
    ),
  );
}

function renderShell(): HTMLElement {
  const container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(<AppShell>Page</AppShell>));
  return container;
}

beforeEach(() => {
  route.pathname = "/overview";
  restore = installMinimalBrowser();
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  act(() => root?.unmount());
  restore();
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = false;
});

describe("mobile navigation accessibility", () => {
  it("covers closed, open, keyboard, explicit, backdrop, and navigation lifecycles", () => {
    renderShell();
    const trigger = findAttribute("aria-controls", MOBILE_NAVIGATION_DRAWER_ID);
    const desktop = findAttribute("data-testid", "desktop-sidebar");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(maybeAttribute("id", MOBILE_NAVIGATION_DRAWER_ID)).toBeUndefined();
    expect(
      maybeAttribute("data-testid", "mobile-navigation-backdrop"),
    ).toBeUndefined();
    expect(
      descendants(desktop).some(
        (element) => element.getAttribute("href") === "/tasks",
      ),
    ).toBe(true);

    trigger.focus();
    click(trigger);
    const drawer = findAttribute("id", MOBILE_NAVIGATION_DRAWER_ID);
    const shell = document.querySelector<HTMLElement>(".dashboard-shell")!;
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(shell.contains(drawer)).toBe(false);
    expect(shell.inert).toBe(true);
    expect(drawer.contains(document.activeElement)).toBe(true);
    const controls = Array.from(
      drawer.querySelectorAll<HTMLElement>("button, a[href]"),
    );
    controls.at(-1)!.focus();
    pressKey("Tab");
    expect(document.activeElement).toBe(controls[0]);
    controls[0]!.focus();
    pressKey("Tab", true);
    expect(document.activeElement).toBe(controls.at(-1));

    pressKey("Escape");
    expect(maybeAttribute("id", MOBILE_NAVIGATION_DRAWER_ID)).toBeUndefined();
    expect(shell.inert).toBe(false);
    expect(document.activeElement).toBe(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("false");

    click(trigger);
    click(findAttribute("aria-label", "shell.closeNavigation"));
    expect(document.activeElement).toBe(trigger);
    click(trigger);
    click(findAttribute("data-testid", "mobile-navigation-backdrop"));
    expect(document.activeElement).toBe(trigger);

    click(trigger);
    const taskLink = descendants(
      findAttribute("id", MOBILE_NAVIGATION_DRAWER_ID),
    ).find((element) => element.getAttribute("href") === "/tasks")!;
    click(taskLink);
    expect(maybeAttribute("id", MOBILE_NAVIGATION_DRAWER_ID)).toBeUndefined();
    expect(shell.inert).toBe(false);
    expect(document.activeElement).toBe(findAttribute("id", "main-content"));
    expect(document.activeElement).not.toBe(trigger);
  });

  it("closes on pathname change without bouncing focus to the trigger", () => {
    renderShell();
    const trigger = findAttribute("aria-controls", MOBILE_NAVIGATION_DRAWER_ID);
    click(trigger);
    route.pathname = "/tasks";
    (
      window as unknown as { location: { pathname: string } }
    ).location.pathname = "/tasks";
    act(() => root.render(<AppShell>Tasks</AppShell>));
    expect(maybeAttribute("id", MOBILE_NAVIGATION_DRAWER_ID)).toBeUndefined();
    expect(document.querySelector<HTMLElement>(".dashboard-shell")!.inert).toBe(
      false,
    );
    expect(document.activeElement).toBe(findAttribute("id", "main-content"));
    expect(document.activeElement).not.toBe(trigger);
  });

  it("does not stack listeners across rerenders and cleans up on unmount", () => {
    const shell = document.createElement("div");
    shell.className = "dashboard-shell";
    const trigger = document.createElement("button");
    const main = document.createElement("main");
    const container = document.createElement("div");
    shell.appendChild(trigger);
    shell.appendChild(main);
    shell.appendChild(container);
    document.body.appendChild(shell);
    root = createRoot(container);
    const onClose = vi.fn();
    const drawer = (
      <MobileNavigationDrawer
        triggerRef={{ current: trigger }}
        mainRef={{ current: main }}
        openedPathname="/overview"
        shouldRestoreFocus={() => true}
        onRequestClose={() => onClose()}
      />
    );
    act(() => root.render(drawer));
    expect(shell.inert).toBe(true);
    act(() => root.render(drawer));
    pressKey("Escape");
    expect(onClose).toHaveBeenCalledTimes(1);
    act(() => root.unmount());
    expect(shell.inert).toBe(false);
    pressKey("Escape");
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

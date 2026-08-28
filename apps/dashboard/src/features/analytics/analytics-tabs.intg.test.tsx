import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const localeState = vi.hoisted(() => ({ locale: "en" as "en" | "ar" }));

vi.mock("../../i18n/locale-provider", () => ({
  useTranslation: () => ({
    locale: localeState.locale,
    t: (key: string) => `${localeState.locale}:${key}`,
  }),
}));

import { installMinimalBrowser } from "../map-setup/setup-map.integration.test-double";
import { AnalyticsTabs, type AnalyticsTab } from "./analytics-tabs";

type TestElement = HTMLElement & { childNodes: TestElement[] };
let restore: () => void = () => undefined;
let root: Root | undefined;

function descendants(element: TestElement): TestElement[] {
  return element.childNodes.flatMap((child) => [child, ...descendants(child)]);
}

function byAttribute(name: string, value: string): TestElement {
  const found = descendants(document.body as unknown as TestElement).find(
    (element) => element.getAttribute(name) === value,
  );
  if (found === undefined) throw new Error(`Missing ${name}=${value}`);
  return found;
}

function allByAttribute(name: string, value: string): TestElement[] {
  return descendants(document.body as unknown as TestElement).filter(
    (element) => element.getAttribute(name) === value,
  );
}

function pressKey(element: HTMLElement, key: string): void {
  act(() =>
    element.dispatchEvent(
      Object.assign(new Event("keydown", { bubbles: true }), { key }),
    ),
  );
}

function TabsHarness({
  onLocationMutation,
}: {
  onLocationMutation: () => void;
}) {
  const [activeTab, setActiveTab] = useState<AnalyticsTab>("operations");
  return (
    <AnalyticsTabs activeTab={activeTab} onSelect={setActiveTab}>
      <div
        data-testid="analytics-authority"
        data-location="location-a"
        data-period="2026-08-01/2026-08-14"
        data-tab={activeTab}
        onDoubleClick={onLocationMutation}
      >
        <span data-testid={`${activeTab}-content`} />
      </div>
    </AnalyticsTabs>
  );
}

function renderTabs(locale: "en" | "ar", onLocationMutation = vi.fn()): void {
  localeState.locale = locale;
  const container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() =>
    root!.render(<TabsHarness onLocationMutation={onLocationMutation} />),
  );
}

function selectedTab(): TestElement {
  return allByAttribute("role", "tab").find(
    (tab) => tab.getAttribute("aria-selected") === "true",
  )!;
}

beforeEach(() => {
  restore = installMinimalBrowser();
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  restore();
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = false;
});

describe.each(["en", "ar"] as const)("Analytics tabs in %s", (locale) => {
  it("uses automatic physical-direction activation with stable tabpanel relationships", () => {
    const onLocationMutation = vi.fn();
    renderTabs(locale, onLocationMutation);
    const tablist = byAttribute("role", "tablist");
    expect(tablist.getAttribute("aria-label")).toBe(
      `${locale}:shell.navAnalytics`,
    );
    const tabs = allByAttribute("role", "tab");
    expect(tabs).toHaveLength(3);
    expect(selectedTab().getAttribute("id")).toBe("analytics-operations-tab");
    expect(
      tabs.filter((tab) => tab.getAttribute("tabindex") === "0"),
    ).toHaveLength(1);
    expect(
      tabs.filter((tab) => tab.getAttribute("tabindex") === "-1"),
    ).toHaveLength(2);

    for (const tab of tabs) {
      expect(tab.getAttribute("aria-controls")).toBe(
        tab.getAttribute("id")!.replace(/-tab$/u, "-panel"),
      );
    }
    expect(allByAttribute("role", "tabpanel")).toHaveLength(1);
    expect(
      byAttribute("role", "tabpanel").getAttribute("aria-labelledby"),
    ).toBe("analytics-operations-tab");
    expect(byAttribute("data-testid", "operations-content")).toBeDefined();

    pressKey(selectedTab(), "ArrowRight");
    expect(selectedTab().getAttribute("id")).toBe("analytics-financial-tab");
    expect(document.activeElement).toBe(selectedTab());
    expect(byAttribute("data-testid", "financial-content")).toBeDefined();
    pressKey(selectedTab(), "ArrowLeft");
    expect(selectedTab().getAttribute("id")).toBe("analytics-operations-tab");
    pressKey(selectedTab(), "Home");
    expect(selectedTab().getAttribute("id")).toBe("analytics-financial-tab");
    pressKey(selectedTab(), "End");
    expect(selectedTab().getAttribute("id")).toBe("analytics-operations-tab");
    pressKey(selectedTab(), "ArrowLeft");
    expect(selectedTab().getAttribute("id")).toBe("analytics-incidents-tab");
    expect(byAttribute("data-testid", "incidents-content")).toBeDefined();

    const authority = byAttribute("data-testid", "analytics-authority");
    expect(authority.getAttribute("data-location")).toBe("location-a");
    expect(authority.getAttribute("data-period")).toBe("2026-08-01/2026-08-14");
    expect(authority.getAttribute("data-tab")).toBe("incidents");
    expect(onLocationMutation).not.toHaveBeenCalled();
  });
});

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const locationState = vi.hoisted(() => ({
  value: {} as {
    status: "ready";
    locations: Array<{
      locationId: string;
      organizationId: string;
      name: string;
      currency: string;
      timezone: string;
    }>;
    location: {
      locationId: string;
      organizationId: string;
      name: string;
      currency: string;
      timezone: string;
    };
    selectLocation: ReturnType<typeof vi.fn>;
  },
}));

vi.mock("../../features/location/location-context", () => ({
  useDashboardLocations: () => locationState.value,
}));
vi.mock("../../i18n/locale-provider", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import { installMinimalBrowser } from "../../features/map-setup/setup-map.integration.test-double";
import { LocationSwitcher } from "./location-switcher";

type TestElement = HTMLElement & {
  childNodes: TestElement[];
  data?: string;
  textContent?: string;
};
let restore: () => void = () => undefined;
let root: Root | undefined;

function descendants(element: TestElement): TestElement[] {
  return element.childNodes.flatMap((child) => [child, ...descendants(child)]);
}

function byClass(className: string): TestElement {
  const found = descendants(document.body as unknown as TestElement).find(
    (element) => element.className.split(" ").includes(className),
  );
  if (found === undefined) throw new Error(`Missing class=${className}`);
  return found;
}

function textOf(element: TestElement): string {
  return (
    element.textContent ??
    `${element.data ?? ""}${element.childNodes.map(textOf).join("")}`
  );
}

function location(
  locationId: string,
  name: string,
  organizationId = "org-00000001",
) {
  return {
    currency: "JOD",
    locationId,
    name,
    organizationId,
    timezone: "Asia/Amman",
  };
}

function renderSwitcher(): void {
  const container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root!.render(<LocationSwitcher />));
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

describe("LocationSwitcher narrow-screen content contract", () => {
  it.each([
    "Downtown Hotel & Convention Center Main Entrance",
    "فندق ومركز مؤتمرات وسط المدينة - المدخل الرئيسي",
  ])("preserves one active Location's complete identity: %s", (name) => {
    const active = location("location-a", name);
    locationState.value = {
      location: active,
      locations: [active],
      selectLocation: vi.fn(),
      status: "ready",
    };
    renderSwitcher();
    const label = byClass("topbar-location-label");
    expect(textOf(label)).toBe(name);
    expect(label.getAttribute("title")).toBe(name);
    expect(textOf(byClass("topbar-location-currency"))).toBe("JOD");
  });

  it("keeps a truthful authorized native selector and disambiguated long labels", () => {
    const name = "Downtown Hotel & Convention Center Main Entrance";
    const first = location("location-a", name, "organization-alpha");
    const second = location("location-b", name, "organization-beta");
    const selectLocation = vi.fn();
    locationState.value = {
      location: second,
      locations: [first, second],
      selectLocation,
      status: "ready",
    };
    const markup = renderToStaticMarkup(<LocationSwitcher />);
    expect(markup).toContain('<select class="topbar-location-select"');
    expect(markup).toContain('aria-label="location.selectorLabel"');
    expect(markup).toContain('<option value="location-b" selected="">');
    expect(markup).toContain(
      "Downtown Hotel &amp; Convention Center Main Entrance",
    );
    expect(markup).toContain("· org organiza…");
    expect(markup).toContain(`title="${name.replace("&", "&amp;")}`);
    expect(selectLocation).not.toHaveBeenCalled();
  });
});

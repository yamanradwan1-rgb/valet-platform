import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { BottomNav } from "./bottom-nav";
import { employeeDictionary } from "../../lib/i18n/dictionary";
import { EmployeeI18nProvider } from "./employee-i18n";

function renderNav(options: {
  active?: "home" | "shift" | "vehicles" | "scan";
  enabledTabs?: Partial<Record<"home" | "vehicles" | "scan" | "shift", boolean>>;
  locale?: "ar" | "en";
  pinned?: boolean;
}): string {
  const nav = (
    <BottomNav
      active={options.active ?? "home"}
      enabledTabs={options.enabledTabs}
      onTab={vi.fn()}
      pinned={options.pinned}
    />
  );
  if (options.locale === undefined) return renderToStaticMarkup(nav);
  return renderToStaticMarkup(
    <EmployeeI18nProvider initialLocale={options.locale}>
      {nav}
    </EmployeeI18nProvider>,
  );
}

function countDisabled(markup: string): number {
  return (markup.match(/disabled=""/g) ?? []).length;
}

/** Extracts one rendered <button …> element whose content contains `label`. */
function buttonTagFor(markup: string, label: string): string {
  const parts = markup.split("<button");
  const part = parts.find((candidate) => candidate.includes(label));
  expect(part).toBeDefined();
  return `<button${part ?? ""}`;
}

describe("DEC-066 §1/§2 Live bottom navigation gating", () => {
  it("keeps Tasks and Shift live-enabled and disables Vehicles and Scan in VUI-011A", () => {
    const markup = renderNav({
      active: "home",
      enabledTabs: { scan: false, vehicles: false },
    });
    expect(markup).toContain("Tasks");
    expect(markup).toContain("Shift");
    // Exactly two truthfully disabled tabs.
    expect(countDisabled(markup)).toBe(2);
    expect(buttonTagFor(markup, "Vehicles")).toContain('disabled=""');
    expect(buttonTagFor(markup, "Scan")).toContain('disabled=""');
    expect(buttonTagFor(markup, "Tasks")).not.toContain('disabled=""');
    expect(buttonTagFor(markup, ">Shift<")).not.toContain('disabled=""');
  });

  it("pins the whole navigation while an operational workflow is active", () => {
    const markup = renderNav({ pinned: true });
    // All four tab buttons carry the disabled attribute.
    expect(countDisabled(markup)).toBe(4);
  });

  it("leaves the navigation fully usable when only top-level surfaces are effective", () => {
    const markup = renderNav({ active: "shift" });
    expect(countDisabled(markup)).toBe(0);
  });

  it("renders localized tab labels in Arabic", () => {
    const ar = employeeDictionary("ar");
    const markup = renderNav({ locale: "ar" });
    expect(markup).toContain(ar.tasksTitle);
    expect(markup).toContain(ar.vehiclesNav);
    expect(markup).toContain(ar.scanNav);
    expect(markup).toContain(ar.shiftNav);
  });
});

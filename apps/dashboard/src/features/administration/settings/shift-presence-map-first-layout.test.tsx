import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  ShiftPresenceMapFirstLayout,
  type ShiftPresenceView,
} from "./shift-presence-map-first-layout";
import { ShiftPresenceSetupSteps } from "./shift-presence-setup-steps";
import type { DashboardLocale } from "../../../lib/i18n/locale";

const views: ShiftPresenceView[] = [
  "overview",
  "zones",
  "policy",
  "exceptions",
  "setup",
];

function renderLayout(view: ShiftPresenceView, locale: DashboardLocale = "en") {
  return renderToStaticMarkup(
    <ShiftPresenceMapFirstLayout
      activeView={view}
      exceptions={<span data-slot="exceptions">Exception queue</span>}
      heading={<h2 id="shift-presence-heading">Shift Presence</h2>}
      locale={locale}
      onView={vi.fn()}
      overview={<span data-slot="overview">Server readiness</span>}
      policy={<span data-slot="policy">Policy form</span>}
      setup={<span data-slot="setup">Setup view</span>}
      zones={<span data-slot="zones">Saved zone map</span>}
    />,
  );
}

describe("Map-first Shift Presence presentation", () => {
  it("shows saved zones first and server readiness alongside on overview", () => {
    const html = renderLayout("overview");
    expect(html.match(/data-slot="zones"/g)).toHaveLength(1);
    expect(html.match(/data-slot="overview"/g)).toHaveLength(1);
    expect(html.indexOf('data-slot="zones"')).toBeLessThan(
      html.indexOf('data-slot="overview"'),
    );
    expect(html).not.toContain('data-slot="policy"');
    expect(html).not.toContain('data-slot="exceptions"');
    expect(html).not.toContain('data-slot="setup"');
    expect(html.match(/id="shift-presence-heading"/g)).toHaveLength(1);
  });

  it.each(views.filter((view) => view !== "overview"))(
    "renders only the %s slot after internal navigation",
    (view) => {
      const html = renderLayout(view);
      for (const other of views) {
        if (other === "overview") {
          expect(html).not.toContain('data-slot="overview"');
          continue;
        }
        expect(html.includes(`data-slot="${other}"`)).toBe(other === view);
      }
      expect(html).toContain(`data-active-view="${view}"`);
      expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
    },
  );

  it("uses Arabic labels and local direction without a new application route", () => {
    const html = renderLayout("zones", "ar");
    expect(html).toContain('dir="rtl"');
    expect(html).toContain("مناطق الحضور");
    expect(html).toContain("سياسة بدء وإنهاء الوردية");
    expect(html).toContain('data-testid="presence-view-overview"');
    expect(html).not.toContain("/policies/shift-presence");
  });
});

describe("Shift Presence guided setup presentation", () => {
  it.each([0, 1, 2, 3])(
    "renders zero-based step %i as navigation without completion claims",
    (step) => {
      const html = renderToStaticMarkup(
        <ShiftPresenceSetupSteps locale="en" onStep={vi.fn()} step={step}>
          <section data-testid="step-body">Server-backed step {step}</section>
        </ShiftPresenceSetupSteps>,
      );
      expect(html.match(/aria-current="step"/g)).toHaveLength(1);
      expect(html.match(/class="[^"]*stepButton/g)).toHaveLength(4);
      expect(html).toContain('data-testid="step-body"');
      expect(html).toContain("Changing steps never saves.");
      expect(html).toContain("Save each zone separately in Step 2");
      expect(html).toContain(
        "policy drafts are applied only after Step 4 review and confirmation.",
      );
      expect(html).not.toContain("Completed");
      const buttons = Array.from(html.matchAll(/<button\b[^>]*>/g), (match) => match[0]);
      expect(buttons).toHaveLength(6);
      expect(buttons[4]!.includes("disabled")).toBe(step === 0);
      expect(buttons[5]!.includes("disabled")).toBe(step === 3);
    },
  );

  it("keeps Arabic step order with RTL and separately labeled save behavior", () => {
    const html = renderToStaticMarkup(
      <ShiftPresenceSetupSteps locale="ar" onStep={vi.fn()} step={3}>
        <p>مراجعة الحالة المحفوظة</p>
      </ShiftPresenceSetupSteps>,
    );
    expect(html).toContain('dir="rtl"');
    expect(html).toContain("النطاق");
    expect(html).toContain("المناطق");
    expect(html).toContain("المراجعة");
    expect(html).toContain("التنقل بين الخطوات لا يحفظ.");
    expect(html).toContain("احفظ كل منطقة على حدة في الخطوة الثانية");
    expect(html).toContain(
      "لا تُطبَّق مسودات السياسة إلا بعد المراجعة والتأكيد في الخطوة الرابعة.",
    );
  });
});

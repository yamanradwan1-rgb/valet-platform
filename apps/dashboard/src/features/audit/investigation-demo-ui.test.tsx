import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { InvestigationDemo } from "./investigation-demo";
import { demoSessions, matchDemoSessions } from "./investigation-demo-fixtures";
import { InvestigationSearchPanel } from "./investigation-search-panel";
import { InvestigationWorkspace } from "./investigation-workspace";
import { DEFAULT_INVESTIGATION_QUERY } from "./investigation-demo-types";

const matches = matchDemoSessions(DEFAULT_INVESTIGATION_QUERY);

function search(locale: "en" | "ar", error?: string) {
  return renderToStaticMarkup(
    <InvestigationSearchPanel
      locale={locale}
      value={DEFAULT_INVESTIGATION_QUERY}
      onApply={() => {}}
      onChange={() => {}}
      onClear={() => {}}
      error={error ?? null}
    />,
  );
}

function workspace(
  locale: "en" | "ar",
  sessionIndex = 0,
  override = matches,
) {
  return renderToStaticMarkup(
    <InvestigationWorkspace
      locale={locale}
      matches={override}
      selectedId={demoSessions[sessionIndex]!.id}
      onSelect={() => {}}
      onEvent={() => {}}
      query={DEFAULT_INVESTIGATION_QUERY}
    />,
  );
}

describe("Issue #300 component accessibility and locale contract", () => {
  it.each(["en", "ar"] as const)(
    "renders a labeled, scoped, keyboard-operable search form in %s",
    (locale) => {
      const html = search(locale);
      expect(html).toContain("<form aria-label=");
      expect(html).toContain('dir="' + (locale === "ar" ? "rtl" : "ltr") + '"');
      expect(html).toContain('type="date"');
      expect(html.match(/type="time"/g)).toHaveLength(2);
      expect(html).toContain('type="submit"');
      expect(html).toContain('aria-expanded="true"');
      expect(html).toMatch(/aria-controls="([^"]+)"/);
      expect(html).toContain('dir="ltr"');
      expect(html).toContain(locale === "ar" ? "خانة المفتاح" : "Key slot");
      expect(html).not.toContain('name="vehicleType"');
    },
  );

  it("announces an external error as an accessible alert", () => {
    const html = search("en", "Invalid time window");
    expect(html).toContain('role="alert"');
    expect(html).toContain("Invalid time window");
    expect(html).toContain("aria-describedby=");
  });

  it.each(["en", "ar"] as const)(
    "renders an empty prototype workspace until Apply in %s",
    (locale) => {
      const html = renderToStaticMarkup(<InvestigationDemo locale={locale} />);
      expect(html).toContain(locale === "ar" ? "نموذج بحث التحقيق" : "Investigation Search prototype");
      expect(html).toContain(locale === "ar" ? "طبّق معايير البحث" : "Apply the search filters");
      expect(html).not.toContain("CUS-106B");
      expect(html).not.toContain('role="dialog"');
    },
  );

  it("renders all 12 source events for a discovered Session, not just witnesses", () => {
    const html = workspace("en");
    const rows = html.match(/<li[^>]+data-kind=/g) ?? [];
    expect(rows).toHaveLength(12);
    expect(html).toContain("13:36:00");
    expect(html).toContain("15:12:00");
    expect(html).toContain("CUS-106B");
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('dir="ltr"');
    expect(html).toContain("Before search window");
    expect(html).toContain("After search window");
  });

  it("keeps an open incident, RTL identity and gap disclosure distinct from events", () => {
    const html = workspace("ar", 2);
    expect(html.match(/<li[^>]+data-kind=/g)).toHaveLength(5);
    expect(html).toContain('dir="ltr"');
    expect(html).toContain("INC-304");
    expect(html).toContain("KEY_MISSING");
    expect(html).toContain("انتقال الحيازة التاريخي غير متاح");
    expect(html).not.toContain("Session completed");
  });

  it("escapes an unsafe event actor and isolates safe presentation", () => {
    const malicious = '<svg onload="window.stolen=true">';
    const victim = matches[0]!;
    const override = [{
      ...victim,
      session: {
        ...victim.session,
        events: victim.session.events.map((event, index) => (
          index === 0 ? { ...event, actor: malicious } : event
        )),
      },
    }];
    const html = workspace("en", 0, override);
    expect(html).toContain("&lt;svg");
    expect(html).not.toContain(malicious);
  });
});

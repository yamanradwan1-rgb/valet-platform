import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { InvestigationContinuationControls } from "./investigation-continuation-controls";
import { InvestigationEmployeeSelector } from "./search/investigation-employee-selector";
import { InvestigationTimeDisambiguation } from "./search/investigation-time-disambiguation";

describe("Issue300 UI-M1 approved conditional markup", () => {
  it("keeps the conditional continuation row full width in tablet and RTL grids", () => {
    const css = readFileSync(new URL("./investigation-continuation.module.css", import.meta.url), "utf8");
    expect(css).toMatch(/\.continuation\s*\{[^}]*grid-column:\s*1\s*\/\s*-1\s*;/s);
    expect(css).not.toMatch(/@media|grid-template-columns|:global/);
  });
  it.each(["en", "ar"] as const)("exposes native continuation semantics in %s", (locale) => {
    const html = renderToStaticMarkup(
      <InvestigationContinuationControls locale={locale} kind="sessions"
        hasMore pending={false} controls="session-list" added={100} onMore={() => {}} />,
    );
    expect(html).toContain('type="button"');
    expect(html).toContain('aria-controls="session-list"');
    expect(html).toContain(locale === "ar" ? "تحميل المزيد من الجلسات" : "Load more Sessions");
    expect(html).toContain(locale === "ar" ? "تم تحميل" : "Loaded");
    const pending = renderToStaticMarkup(
      <InvestigationContinuationControls locale={locale} kind="events"
        hasMore pending controls="event-list" onMore={() => {}} />,
    );
    expect(pending).toContain("disabled");
    expect(pending).toContain(locale === "ar" ? "جارٍ التحميل" : "Loading");
  });

  it("preserves the native employee select for small directories", () => {
    const html = renderToStaticMarkup(<InvestigationEmployeeSelector locale="en"
      label="Employee" any="Any employee" value="" options={[]}
      onChange={() => {}} />);
    expect(html).toContain("<select");
    expect(html).not.toContain("Refine employee name");
    expect(html).not.toContain("Previous");
  });

  it("exposes prefix and keyboard-native option controls only in the large state", () => {
    const html = renderToStaticMarkup(<InvestigationEmployeeSelector locale="ar"
      label="الموظف" any="أي موظف" value="" oversized
      options={[{ id: "00000000-0000-4000-8000-000000000001", label: "أحمد" },
        { id: "00000000-0000-4000-8000-000000000002", label: "أحمد" }]}
      unpaged onChange={() => {}} onRefine={() => {}} />);
    expect(html).toContain("تضييق البحث باسم الموظف");
    expect(html).toContain('dir="auto"');
    expect(html).toContain("00000000-0000-4000-8000-000000000002");
    expect(html).toContain('type="button"');
    expect(html).toContain("توجد خيارات إضافية");
  });

  it("shows explicit offset choices only for a fold, and a correction for a gap", () => {
    const base = { locale: "en" as const, timezone: "America/New_York",
      describedBy: "fold-choice", onChange: () => {} };
    const fold = renderToStaticMarkup(<InvestigationTimeDisambiguation {...base}
      date="2026-11-01" minute="01:30" />);
    expect(fold).toContain('aria-required="true"');
    expect(fold).toContain("First occurrence");
    expect(fold).toContain("Second occurrence");
    expect(fold).toContain("UTC-04:00");
    expect(fold).toContain("UTC-05:00");
    const unique = renderToStaticMarkup(<InvestigationTimeDisambiguation {...base}
      date="2026-11-02" minute="01:30" />);
    expect(unique).toBe("");
    const gap = renderToStaticMarkup(<InvestigationTimeDisambiguation {...base}
      date="2026-03-08" minute="02:30" />);
    expect(gap).toContain('role="alert"');
    expect(gap).toContain("does not exist");
  });
});

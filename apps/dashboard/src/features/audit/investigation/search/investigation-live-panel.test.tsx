import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { InvestigationSearchPanel } from "../../investigation-search-panel";
import { DEFAULT_INVESTIGATION_QUERY } from "../../investigation-demo-types";

const memberId = "11111111-1111-4111-8111-111111111111";
const slotId = "22222222-2222-4222-8222-222222222222";
const locationId = "33333333-3333-4333-8333-333333333333";

function render(locale: "ar" | "en", live: boolean, selectorError?: string) {
  return renderToStaticMarkup(
    <InvestigationSearchPanel
      locale={locale}
      live={live}
      locationName="Actual current location from scoped API"
      employeeOptions={[{ id: memberId, label: "Actual current member" }]}
      slotOptions={[{ id: slotId, label: "K-17" }]}
      selectorError={selectorError ?? null}
      value={{
        ...DEFAULT_INVESTIGATION_QUERY,
        location: locationId,
        slot: "K-17",
        employee: memberId,
      }}
      onChange={() => {}}
      onApply={() => {}}
      onClear={() => {}}
    />,
  );
}

describe("W5 narrow Concept A live form exception", () => {
  it.each(["en", "ar"] as const)(
    "keeps frozen form classes/order and only renders API options in %s",
    (locale) => {
      const html = render(locale, true);
      expect(html).toContain('dir="' + (locale === "ar" ? "rtl" : "ltr") + '"');
      expect(html).toContain('value="' + locationId + '"');
      expect(html).toContain("Actual current location from scoped API");
      expect(html).toContain('value="' + memberId + '"');
      expect(html).toContain("Actual current member");
      expect(html).toContain('value="K-17"');
      expect(html).toContain("<datalist");
      expect(html).toContain('type="date"');
      expect(html.match(/type="time"/g)).toHaveLength(2);
      expect(html).toContain('type="submit"');
      expect(html).not.toContain("VAYLET Pilot North");
      expect(html).not.toContain("DEM-214");
      expect(html).not.toContain("VS-DEMO-1021");
      expect(html).not.toContain("Samir Khalil");
      expect(html).not.toContain("K-07");
      const sequence = [
        "Actual current location",
        'type="date"',
        'type="time"',
        "K-17",
        "Actual current member",
      ].map((fragment) => html.indexOf(fragment));
      expect(sequence.every((item) => item >= 0)).toBe(true);
      expect(sequence).toEqual([...sequence].sort((a, b) => a - b));
    },
  );

  it("renders scope/selector failures in existing alert, without demo labels", () => {
    const html = render("en", true, "Key slot matches are not yet verified");
    expect(html).toContain('role="alert"');
    expect(html).toContain("Key slot matches are not yet verified");
    expect(html).toContain("aria-describedby");
  });

  it("preserves original demo fallback and fixture options when live is off", () => {
    const html = render("en", false);
    expect(html).toContain("VAYLET Pilot North");
    expect(html).toContain("Samir Khalil");
    expect(html).toContain('placeholder="K-07"');
    expect(html).toContain('placeholder="DEM-214"');
    expect(html).not.toContain("<datalist");
    expect(html).not.toContain("Actual current member");
  });

  it("never falls back to a fictional person or location while selectors load", () => {
    const html = renderToStaticMarkup(
      <InvestigationSearchPanel
        locale="en"
        live
        value={{ ...DEFAULT_INVESTIGATION_QUERY, location: "", slot: "", employee: "" }}
        onChange={() => {}}
        onApply={() => {}}
        onClear={() => {}}
      />,
    );
    expect(html).not.toContain("VAYLET Pilot North");
    expect(html).not.toContain("Nora Haddad");
    expect(html).not.toContain("Samir Khalil");
    expect(html).not.toContain('placeholder="K-07"');
    expect(html).toContain('value=""');
    expect(html).toContain("<datalist");
  });
});

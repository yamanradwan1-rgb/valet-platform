import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { Issue304Option3CreateForm } from "./issue304-option3-create-form";

const page = {
  data: { items: [], nextCursor: null },
  loading: false,
  error: null,
  hasPrevious: false,
  next: vi.fn(),
  previous: vi.fn(),
  refresh: vi.fn(),
} as never;

function render(kind: "key-slot" | "parking-spot", locale: "en" | "ar" = "en") {
  return renderToStaticMarkup(
    <Issue304Option3CreateForm
      kind={kind}
      locale={locale}
      code=""
      label=""
      zoneId=""
      zones={[{
        parkingZoneId: "authorized-zone",
        code: "ZONE-A",
        label: "North Zone",
        status: "ACTIVE",
      }]}
      zonePage={page}
      busy={false}
      error={null}
      onCode={vi.fn()}
      onLabel={vi.fn()}
      onZone={vi.fn()}
      onCancel={vi.fn()}
      onSubmit={vi.fn()}
    />,
  );
}

describe("Issue #304 approved live creation layout", () => {
  it("shows Code and optional Label with Cancel/Create, no synthetic preview", () => {
    const markup = render("key-slot");
    expect(markup).toContain('class="issue304-modal-form"');
    expect(markup).toContain("This creates a persisted resource");
    expect(markup).toContain(" (optional)");
    expect(markup).toContain("Cancel");
    expect(markup).toContain("Create");
    expect(markup).not.toContain("Preview draft");
    expect(markup).not.toContain("Parking zone</span>");
    expect(markup).not.toContain("Add Parking Zone");
  });

  it("matches the approved Spot code/label/zone field trio without nested Add Zone", () => {
    const markup = render("parking-spot");
    expect((markup.match(/<label/g) ?? []).length).toBe(3);
    expect(markup).toContain("North Zone");
    expect(markup).toContain("ZONE-A");
    expect(markup).toContain("Parking Zone");
    expect(markup).not.toContain("Add Parking Zone");
  });

  it("renders localized Arabic operational wording without preview claims", () => {
    const markup = render("parking-spot", "ar");
    expect(markup).toContain("سيُحفظ المورد");
    expect(markup).toContain("إنشاء");
    expect(markup).not.toContain("معاينة التصميم");
  });
});

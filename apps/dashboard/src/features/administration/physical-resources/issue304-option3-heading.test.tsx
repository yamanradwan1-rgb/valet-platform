import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { Issue304Option3Heading } from "./issue304-option3-heading";

describe("Issue #304 optional approved modal heading", () => {
  it("renders the production-true kicker, real action title, and accessible close button in English", () => {
    const markup = renderToStaticMarkup(
      <Issue304Option3Heading
        title="Add Parking Spot"
        kicker="resource-create"
        locale="en"
        onClose={vi.fn()}
      />,
    );
    expect(markup).toContain("RESOURCE CREATION");
    expect(markup).not.toContain("DESIGN PREVIEW");
    expect(markup).toContain("Add Parking Spot");
    expect(markup).toContain('aria-label="Close"');
    expect(markup).toContain('class="issue304-modal-close"');
  });

  it("localizes the header and keeps contextual help within the modal header", () => {
    const markup = renderToStaticMarkup(
      <Issue304Option3Heading
        title="إضافة منطقة وقوف"
        kicker="parking-zone"
        locale="ar"
        onClose={vi.fn()}
      >
        <button type="button">مساعدة</button>
      </Issue304Option3Heading>,
    );
    expect(markup).toContain("منطقة وقوف");
    expect(markup).not.toContain("معاينة التصميم");
    expect(markup).toContain("إضافة منطقة وقوف");
    expect(markup).toContain('aria-label="إغلاق"');
    expect(markup).toContain("مساعدة");
  });
});

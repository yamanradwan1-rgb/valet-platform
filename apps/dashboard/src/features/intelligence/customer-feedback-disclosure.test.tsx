import type { CustomerFeedbackAnalyticsWithCommentsResponse } from "@valet/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CustomerFeedbackInsights } from "./customer-feedback-insights";

const record = {
  visitReference: "VISIT-123456789ABC",
  rating: 5,
  completedAt: "2026-11-13T12:00:00Z",
  ratedAt: "2026-11-13T12:00:00Z",
  authorizedLocationLabel: "Test Location",
  locationTimezone: "Asia/Amman",
};

const data: CustomerFeedbackAnalyticsWithCommentsResponse = {
  scope: "LOCATION", from: "2026-11-01", to: "2026-11-26",
  eligibleCompletedVisits: 4, ratedVisits: 3, averageRating: "5.0000",
  participationRate: "0.750000",
  distribution: { five: 3, four: 0, three: 0, two: 0, one: 0 },
  recentRatings: [
    { ...record, comment: "Great service\nشكراً" },
    { ...record, visitReference: "VISIT-223456789ABC", comment: null },
    { ...record, visitReference: "VISIT-323456789ABC", comment: "<script>alert(1)</script>" },
  ],
};

describe("#463 frozen Customer Feedback disclosure", () => {
  it("renders exactly two icons, no-icon for historical/null, scoped hidden panels and safe literal text", () => {
    const markup = renderToStaticMarkup(<CustomerFeedbackInsights data={data} locale="en" />);
    expect(markup.match(/aria-expanded="false"/g)).toHaveLength(2);
    expect(markup.match(/aria-controls=/g)).toHaveLength(2);
    expect(markup.match(/hidden=""/g)).toHaveLength(2);
    expect(markup.match(/role="img"/g)).toHaveLength(3);
    expect(markup).toContain("Guest comment");
    expect(markup).toContain('dir="auto"');
    expect(markup).toContain("&lt;script&gt;");
    expect(markup).not.toContain("<script>");
    expect(markup).not.toContain("View comment for VISIT-223456789ABC");
  });

  it("uses the exact frozen Arabic title and label, no changed metrics", () => {
    const markup = renderToStaticMarkup(<CustomerFeedbackInsights data={data} locale="ar" />);
    expect(markup).toContain("عرض تعليق VISIT-123456789ABC");
    expect(markup).toContain("تعليق الضيف");
    expect(markup).toContain("VISIT-223456789ABC");
    expect(markup).toContain('aria-label="5 نجوم"');
  });
  it("keeps duplicate display references in separate disclosure panels", () => {
    const duplicate = { ...data, recentRatings: [
      { ...record, comment: "First comment" },
      { ...record, comment: "Second comment" },
    ] };
    const markup = renderToStaticMarkup(<CustomerFeedbackInsights data={duplicate} locale="en" />);
    const ids = [...markup.matchAll(/aria-controls="([^"]+)"/g)].map(match => match[1]);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
    for (const id of ids) expect(markup).toContain(`id="${id}"`);
    expect(markup).toContain("First comment");
    expect(markup).toContain("Second comment");
  });
});

import type { CustomerFeedbackAnalyticsResponse } from "@valet/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { DashboardApiError } from "../../lib/api/dashboard-api-error";
import { feedbackDate } from "./customer-feedback-copy";
import { CustomerFeedbackSection, type CustomerFeedbackSectionProps } from "./customer-feedback-section";

const data: CustomerFeedbackAnalyticsResponse = {
  scope: "COMPANY",
  from: "2026-09-01",
  to: "2026-09-30",
  eligibleCompletedVisits: 120,
  ratedVisits: 78,
  averageRating: "3.910",
  participationRate: "0.65000",
  distribution: { five: 30, four: 24, three: 14, two: 7, one: 3 },
  recentRatings: [
    { visitReference: "VISIT-A", rating: 5, authorizedLocationLabel: "Main Garage",
      completedAt: "2026-09-29T21:30:00.000Z", ratedAt: "2026-10-02T08:00:00.000Z", locationTimezone: "Asia/Amman" },
    { visitReference: "VISIT-B", rating: 1, authorizedLocationLabel: "North Garage",
      completedAt: "2026-09-28T18:00:00.000Z", ratedAt: "2026-09-29T18:00:00.000Z", locationTimezone: "America/New_York" },
  ],
};

function render(changes: Partial<CustomerFeedbackSectionProps> = {}) {
  return renderToStaticMarkup(
    <CustomerFeedbackSection
      data={data}
      error={null}
      loading={false}
      locale="en"
      onRetry={() => undefined}
      period={{ from: "2026-09-01", to: "2026-09-30" }}
      periodMessage={null}
      scopeLabel="All authorized Locations"
      {...changes}
    />,
  );
}

describe("Option 1 Customer Feedback view", () => {
  it("renders the approved summary-first hierarchy with explicit sample and distribution", () => {
    const html = render();
    expect(html.indexOf("feedback-avg")).toBeLessThan(html.indexOf("feedback-distribution"));
    expect(html.indexOf("feedback-distribution")).toBeLessThan(html.indexOf("feedback-recent-list"));
    expect(html).toContain("3.91");
    expect(html).toContain("65%");
    expect(html).toContain("feedback-sample-count\">78");
    expect(html).toContain("feedback-eligible-count\">120");
    expect(html).toContain('aria-valuenow="65"');
    expect(html).toContain("5 stars: 30");
    expect(html).toContain("1 star: 3");
    expect(html).toContain("VISIT-A");
    expect(html).toContain("VISIT-B");
    expect(html).not.toContain("DEMO DATA");
    expect(html).not.toContain("SIMULATION");
  });

  it("distinguishes zero rated visits from a zero eligible denominator", () => {
    const unrated = render({ data: { ...data, ratedVisits: 0, averageRating: null,
      participationRate: "0.00000", distribution: { five: 0, four: 0, three: 0, two: 0, one: 0 }, recentRatings: [] } });
    expect(unrated).toContain("No ratings for eligible visits");
    expect(unrated).toContain("0%");
    expect(unrated).toContain('aria-valuenow="0"');
    expect(unrated).not.toContain("0.00</span>");

    const noCohort = render({ data: { ...data, eligibleCompletedVisits: 0, ratedVisits: 0,
      averageRating: null, participationRate: null,
      distribution: { five: 0, four: 0, three: 0, two: 0, one: 0 }, recentRatings: [] } });
    expect(noCohort).toContain("No eligible completed visits");
    expect(noCohort).toContain("Not available");
    expect(noCohort).not.toContain("aria-valuenow");
  });

  it("shows AR copy while preserving isolate around date range and counts", () => {
    const html = render({ locale: "ar" });
    expect(html).toContain("تقييمات العملاء");
    expect(html).toContain("نسبة المشاركة");
    expect(html).toContain('dir="ltr">2026-09-01 – 2026-09-30');
    expect(html).toContain('dir="ltr">78');
  });

  it("does not display stale rating details in loading, denied, or error states", () => {
    const loading = render({ loading: true });
    expect(loading).toContain('aria-busy="true"');
    expect(loading).not.toContain("VISIT-A");

    const denied = render({ error: new DashboardApiError({ kind: "authorization", message: "Forbidden" }) });
    expect(denied).toContain('data-state="denied"');
    expect(denied).not.toContain("VISIT-A");
    expect(denied).not.toContain("Forbidden");
    expect(denied).not.toContain("<button");

    const error = render({ error: new Error("PRIVATE_BACKEND_MESSAGE") });
    expect(error).toContain('data-state="error"');
    expect(error).toContain('type="button"');
    expect(error).not.toContain("PRIVATE_BACKEND_MESSAGE");
    expect(error).not.toContain("VISIT-A");
  });

  it("formats each recent completion/rating in its persisted Location timezone", () => {
    expect(feedbackDate("2026-10-01T21:30:00.000Z", "Asia/Amman", "en")).toContain("2 Oct 2026");
    expect(feedbackDate("2026-10-02T01:00:00.000Z", "America/New_York", "en")).toContain("1 Oct 2026");
    expect(render()).toContain("30 Sept 2026");
    expect(render()).toContain("2 Oct 2026");
  });
});

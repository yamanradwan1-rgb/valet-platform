import { describe, expect, it } from "vitest";
import { reportRowLabel } from "./report-row-label";

describe("report manager labels", () => {
  it("retains currency and timezone identity while translating metrics", () => {
    expect(reportRowLabel("JOD.collectedAmountTotal", "en")).toBe(
      "JOD · Collected",
    );
    expect(reportRowLabel("USD.collectedAmountTotal", "ar")).toContain(
      "USD · ",
    );
    expect(reportRowLabel("Asia/Amman.periodStartUtc", "en")).toBe(
      "Asia/Amman · Period start (UTC)",
    );
    expect(reportRowLabel("checkInTime.averageSeconds", "en")).toBe(
      "Check-in Time · Average duration",
    );
  });
  it("translates controlled lifecycle evidence without inventing labels for free-form types", () => {
    expect(reportRowLabel("dispatch.RETRIEVAL.QUEUED", "ar")).toBe(
      "الإسناد · الاسترجاع · في قائمة الانتظار",
    );
    expect(reportRowLabel("keyExceptions.KEY_LOCKED_INSIDE", "en")).toBe(
      "Key Exceptions · Key locked inside",
    );
    expect(reportRowLabel("type.TEST", "en")).toBe("Incident type · TEST");
    expect(reportRowLabel("type.constructor", "en")).toBe(
      "Incident type · constructor",
    );
  });
});

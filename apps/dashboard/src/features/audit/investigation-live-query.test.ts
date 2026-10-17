import { describe, expect, it } from "vitest";

import {
  ammanDateToday,
  buildLiveInvestigationQuery,
  createLiveInvestigationDraft,
} from "./investigation-live-query";
import { dateInLocationZone, investigationMinuteToUtc } from "./investigation-live-timezone";

const locationId = "018f1234-5678-4abc-9234-56789abcdef0";
const slotId = "018f1234-5678-4abc-9234-56789abcdef1";
const personId = "018f1234-5678-4abc-9234-56789abcdef2";

describe("Issue300 real Investigation input semantics", () => {
  it("uses Asia/Amman date, never local machine timezone or fictional date", () => {
    const now = new Date("2026-10-17T22:30:00.000Z");
    expect(ammanDateToday(now)).toBe("2026-10-18");
    expect(createLiveInvestigationDraft(locationId, now).date).toBe("2026-10-18");
    expect(createLiveInvestigationDraft(locationId, now).slot).toBe("");
  });

  it("converts inclusive/exclusive event window into exact UTC instants", () => {
    const draft = {
      ...createLiveInvestigationDraft(locationId),
      date: "2026-10-23", start: "14:00", end: "15:00",
      make: "Toyota", sessionId: locationId,
    };
    const query = buildLiveInvestigationQuery(draft, locationId, {
      keySlotId: slotId, membershipId: personId,
    });
    expect(query).toMatchObject({
      from: "2026-10-23T11:00:00.000Z",
      to: "2026-10-23T12:00:00.000Z",
      keySlotId: slotId,
      membershipId: personId,
      make: "Toyota",
      sessionId: locationId,
      limit: 100,
    });
    expect(query).not.toHaveProperty("vehicleType");
  });

  it("rejects scope substitution, inverted time or impossible dates", () => {
    const draft = createLiveInvestigationDraft(locationId);
    expect(() => buildLiveInvestigationQuery({ ...draft, location: slotId }, locationId, {}))
      .toThrow();
    expect(() => buildLiveInvestigationQuery({ ...draft, start: "15:00", end: "14:00" }, locationId, {}))
      .toThrow();
    expect(() => buildLiveInvestigationQuery({ ...draft, date: "2026-02-30" }, locationId, {}))
      .toThrow();
  });

  it("uses persisted Location timezone rather than fixed Amman or machine timezone", () => {
    const draft = { ...createLiveInvestigationDraft(locationId),
      date: "2026-10-23", start: "14:00", end: "15:00" };
    expect(buildLiveInvestigationQuery(draft, locationId, {}, "Europe/London"))
      .toMatchObject({ from: "2026-10-23T13:00:00.000Z",
        to: "2026-10-23T14:00:00.000Z" });
    expect(buildLiveInvestigationQuery(draft, locationId, {}, "Asia/Kathmandu"))
      .toMatchObject({ from: "2026-10-23T08:15:00.000Z",
        to: "2026-10-23T09:15:00.000Z" });
    expect(dateInLocationZone("Asia/Tokyo", new Date("2026-10-17T20:00:00.000Z")))
      .toBe("2026-10-18");
  });

  it("fails closed on a nonexistent or ambiguous DST wall minute", () => {
    expect(() => investigationMinuteToUtc("2026-03-08", "02:30", "America/New_York"))
      .toThrow("NONEXISTENT_LOCAL_TIME");
    expect(() => investigationMinuteToUtc("2026-11-01", "01:30", "America/New_York"))
      .toThrow("AMBIGUOUS_LOCAL_TIME_REQUIRES_OFFSET");
    expect(() => investigationMinuteToUtc("2026-01-01", "00:00", "Not/A_Timezone"))
      .toThrow("INVALID_LOCATION_TIMEZONE");
    expect(investigationMinuteToUtc("2026-10-23", "14:00", "Asia/Amman"))
      .toBe("2026-10-23T11:00:00.000Z");
  });
});

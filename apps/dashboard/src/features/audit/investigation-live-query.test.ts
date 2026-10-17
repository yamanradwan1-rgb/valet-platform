import { describe, expect, it } from "vitest";

import {
  ammanDateToday,
  buildLiveInvestigationQuery,
  createLiveInvestigationDraft,
} from "./investigation-live-query";

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
});

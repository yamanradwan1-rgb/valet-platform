import { describe, expect, it } from "vitest";

import { ApiTransportValidationError } from "../src/common/http/api-errors";
import { liveSessionOverviewCursor } from "../src/modules/dashboard/live-session-overview-cursor";
import { sessionOverviewCursor } from "../src/modules/dashboard/session-overview-cursor";

const organizationId = "11111111-1111-4111-8111-111111111111";
const locationId = "22222222-2222-4222-8222-222222222222";
const anotherLocation = "33333333-3333-4333-8333-333333333333";
const tiebreakerId = "44444444-4444-4444-8444-444444444444";
const scope = { organizationId, locationId, filter: "PARKED" as const };
const pointer = { sortKey: "2026-10-09T09:00:00.000Z", tiebreakerId };

describe("DEC-102 purpose-bound Live sessions cursors", () => {
  it("round trips only within the same authorized Organization, Location and filter", () => {
    const codec = liveSessionOverviewCursor(scope);
    const token = codec.encode(pointer);
    expect(codec.decode(token)).toEqual(pointer);
    expect(() =>
      liveSessionOverviewCursor({
        ...scope,
        locationId: anotherLocation,
      }).decode(token),
    ).toThrow(ApiTransportValidationError);
    expect(() =>
      liveSessionOverviewCursor({ ...scope, filter: "ALL" }).decode(token),
    ).toThrow(ApiTransportValidationError);
  });

  it("rejects old Vehicles cursor and malformed or noncanonical tokens", () => {
    const live = liveSessionOverviewCursor(scope);
    const original = sessionOverviewCursor(scope);
    expect(() => live.decode(original.encode(pointer))).toThrow(
      ApiTransportValidationError,
    );
    expect(() => original.decode(live.encode(pointer))).toThrow(
      ApiTransportValidationError,
    );
    expect(() => live.decode("not-base64!!!")).toThrow(
      ApiTransportValidationError,
    );
    const malformed = Buffer.from(
      JSON.stringify({
        v: 3,
        d: "live-sessions",
        ...scope,
        ...pointer,
        extra: "forbidden",
      }),
      "utf8",
    ).toString("base64url");
    expect(() => live.decode(malformed)).toThrow(ApiTransportValidationError);
  });
});

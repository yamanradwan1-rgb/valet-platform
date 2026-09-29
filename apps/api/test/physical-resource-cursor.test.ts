import { describe, expect, it } from "vitest";

import { ApiTransportValidationError } from "../src/common/http/api-errors";
import { physicalResourceCursorCodec } from "../src/modules/dashboard/physical-resource-cursor";

const LOCATION_A = "11111111-1111-4111-8111-111111111111";
const LOCATION_B = "22222222-2222-4222-8222-222222222222";
const RESOURCE_ID = "33333333-3333-4333-8333-333333333333";

describe("Issue #232 physical-resource cursors", () => {
  it("round-trips a versioned exact-Location cursor", () => {
    const codec = physicalResourceCursorCodec("key-slots", LOCATION_A);
    const encoded = codec.encode({ id: RESOURCE_ID, sortKey: "K-01" });

    expect(codec.decode(encoded)).toEqual({
      id: RESOURCE_ID,
      sortKey: "K-01",
    });
  });

  it("rejects a cursor in another Location or resource family", () => {
    const encoded = physicalResourceCursorCodec("key-slots", LOCATION_A).encode({
      id: RESOURCE_ID,
      sortKey: "K-01",
    });

    expect(() => physicalResourceCursorCodec("key-slots", LOCATION_B).decode(encoded))
      .toThrow(ApiTransportValidationError);
    expect(() => physicalResourceCursorCodec("parking-spots", LOCATION_A).decode(encoded))
      .toThrow(ApiTransportValidationError);
  });

  it("rejects malformed cursors instead of widening scope", () => {
    expect(() => physicalResourceCursorCodec("key-slots", LOCATION_A).decode("not-a-cursor"))
      .toThrow(ApiTransportValidationError);
  });
});

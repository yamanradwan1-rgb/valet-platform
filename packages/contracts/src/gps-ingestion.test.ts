import { describe, expect, it } from "vitest";

import {
  gpsIngestionRequestSchema,
  gpsIngestionResponseSchema,
} from "./gps-ingestion.js";

const sample = {
  accuracyMeters: 8,
  capturedAt: "2026-08-15T10:00:00+03:00",
  clientSampleId: "a7d77ed2-06a8-4fac-8b82-57ecb629c6c9",
  latitude: 31.9539,
  longitude: 35.9106,
};

describe("GPS ingestion contracts", () => {
  it("accepts the strict 1-50 sample request and caller-owned response", () => {
    expect(gpsIngestionRequestSchema.parse({ samples: [sample] })).toEqual({
      samples: [sample],
    });
    expect(
      gpsIngestionResponseSchema.parse({
        samples: [
          { clientSampleId: sample.clientSampleId, status: "ACCEPTED" },
        ],
      }),
    ).toBeDefined();
  });

  it.each([
    { samples: [] },
    { samples: Array.from({ length: 51 }, () => sample) },
    { samples: [{ ...sample, organizationId: sample.clientSampleId }] },
    { samples: [{ ...sample, capturedAt: "2026-08-15T10:00:00" }] },
    { samples: [{ ...sample, latitude: Number.NaN }] },
    { samples: [{ ...sample, latitude: 90.01 }] },
    { samples: [{ ...sample, longitude: Number.POSITIVE_INFINITY }] },
    { samples: [{ ...sample, longitude: -180.01 }] },
    { samples: [{ ...sample, accuracyMeters: 0 }] },
    { samples: [{ ...sample, accuracyMeters: Number.NaN }] },
    { samples: [{ ...sample, accuracyMeters: 100.01 }] },
  ])("rejects an invalid request %#", (request) => {
    expect(gpsIngestionRequestSchema.safeParse(request).success).toBe(false);
  });
});

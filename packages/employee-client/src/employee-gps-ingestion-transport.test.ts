import { describe, expect, it } from "vitest";

import { EmployeeClient, type EmployeeTransportRequest } from "./employee-client";
import { createEmployeeGpsIngestionTransport } from "./employee-gps-ingestion-transport";

const sample = {
  accuracyMeters: 7,
  capturedAt: "2026-10-07T00:00:00.000Z",
  clientSampleId: "11111111-1111-4111-8111-111111111111",
  latitude: 31.95,
  longitude: 35.91,
};

describe("#270 employee GPS ingestion transport", () => {
  it("reuses the existing strict task GPS route without authority fields", async () => {
    let request: EmployeeTransportRequest | undefined;
    const client = new EmployeeClient({
      transport: {
        async execute(value) {
          request = value;
          return {
            payload: {
              samples: [
                { clientSampleId: sample.clientSampleId, status: "ACCEPTED" },
              ],
            },
            status: 200,
          };
        },
      },
    });
    const transport = createEmployeeGpsIngestionTransport(() => client);

    await transport.upload("22222222-2222-4222-8222-222222222222", [sample]);

    expect(request).toEqual({
      body: { samples: [sample] },
      method: "POST",
      path: "/v1/staff/valet-sessions/22222222-2222-4222-8222-222222222222/tracking/gps-samples",
    });
  });

  it("fails closed on an incoherent server response shape", async () => {
    const client = new EmployeeClient({
      transport: {
        async execute() {
          return { payload: { samples: [] }, status: 200 };
        },
      },
    });
    const transport = createEmployeeGpsIngestionTransport(() => client);

    await expect(
      transport.upload("22222222-2222-4222-8222-222222222222", [sample]),
    ).rejects.toMatchObject({ code: "GPS_INGESTION_RESPONSE_INVALID" });
  });
});

import { Logger } from "@nestjs/common";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { PlateOcrHttpContext } from "./plate-ocr-http-context";

const c = new PlateOcrHttpContext();
let logger: ReturnType<typeof vi.spyOn>;

function boundaryMessages(): string[] {
  return logger.mock.calls
    .map(([message]: [unknown, ...unknown[]]) => String(message))
    .filter((message: string) => message.startsWith("PLATE_OCR_BOUNDARY "));
}

beforeAll(() => c.start(), 120_000);
afterAll(() => c.stop(), 30_000);
beforeEach(() => {
  c.reset();
  vi.stubEnv("NODE_ENV", "test");
  logger = vi.spyOn(Logger.prototype, "log").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("pre-provider Plate OCR diagnostics", () => {
  it("traces a valid request through provider dispatch", async () => {
    const staff = await c.staff();
    const response = await c.request(staff.token, {
      targetLocationId: staff.locationId,
      plateCountry: "JO",
    });

    expect(response.status).toBe(200);
    expect(c.calls).toBe(1);
    expect(boundaryMessages()).toEqual([
      "PLATE_OCR_BOUNDARY auth-success",
      "PLATE_OCR_BOUNDARY request-authenticated",
      "PLATE_OCR_BOUNDARY multipart-accepted",
      "PLATE_OCR_BOUNDARY metadata-valid",
      "PLATE_OCR_BOUNDARY controller-to-service",
      "PLATE_OCR_BOUNDARY location-authorized",
      "PLATE_OCR_BOUNDARY shift-eligible",
      "PLATE_OCR_BOUNDARY cost-guard-acquired",
      "PLATE_OCR_BOUNDARY provider-dispatch",
    ]);
  });

  it("stops invalid JPEG magic before the service and provider", async () => {
    const staff = await c.staff();
    const response = await c.request(
      staff.token,
      { targetLocationId: staff.locationId, plateCountry: "JO" },
      new Uint8Array([1, 2, 3, 4]),
    );

    expect(response.status).toBe(400);
    expect(c.calls).toBe(0);
    expect(boundaryMessages()).toContain(
      "PLATE_OCR_BOUNDARY image-jpeg-magic-invalid",
    );
    expect(boundaryMessages()).not.toContain(
      "PLATE_OCR_BOUNDARY controller-to-service",
    );
    expect(boundaryMessages()).not.toContain(
      "PLATE_OCR_BOUNDARY provider-dispatch",
    );
  });

  it("stops a missing image before the provider", async () => {
    const staff = await c.staff();
    const body = new FormData();
    body.append("targetLocationId", staff.locationId);
    body.append("plateCountry", "JO");
    const response = await fetch(`${c.origin}/v1/staff/check-in/plate-ocr`, {
      method: "POST",
      body,
      headers: { Authorization: `Bearer ${staff.token}` },
    });

    expect(response.status).toBe(400);
    expect(c.calls).toBe(0);
    expect(boundaryMessages()).toContain("PLATE_OCR_BOUNDARY image-missing");
    expect(boundaryMessages()).not.toContain(
      "PLATE_OCR_BOUNDARY provider-dispatch",
    );
  });

  it("stops authentication failure before multipart and provider", async () => {
    const staff = await c.staff();
    const response = await c.request(undefined, {
      targetLocationId: staff.locationId,
      plateCountry: "JO",
    });

    expect(response.status).toBe(401);
    expect(c.calls).toBe(0);
    expect(boundaryMessages()).toContain("PLATE_OCR_BOUNDARY auth-failure");
    expect(boundaryMessages()).not.toContain(
      "PLATE_OCR_BOUNDARY request-authenticated",
    );
    expect(boundaryMessages()).not.toContain(
      "PLATE_OCR_BOUNDARY multipart-accepted",
    );
    expect(boundaryMessages()).not.toContain(
      "PLATE_OCR_BOUNDARY provider-dispatch",
    );
  });

  it("stops shift ineligibility before cost and provider", async () => {
    const staff = await c.staff(false);
    const response = await c.request(staff.token, {
      targetLocationId: staff.locationId,
      plateCountry: "JO",
    });

    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(c.calls).toBe(0);
    expect(boundaryMessages()).toContain(
      "PLATE_OCR_BOUNDARY location-authorized",
    );
    expect(boundaryMessages()).toContain("PLATE_OCR_BOUNDARY shift-ineligible");
    expect(boundaryMessages()).not.toContain(
      "PLATE_OCR_BOUNDARY cost-guard-acquired",
    );
    expect(boundaryMessages()).not.toContain(
      "PLATE_OCR_BOUNDARY provider-dispatch",
    );
  });

  it("stops a cost guard denial before a second provider call", async () => {
    const staff = await c.staff();
    const fields = { targetLocationId: staff.locationId, plateCountry: "JO" };
    let entered!: () => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    let finish!: () => void;
    c.result = () =>
      new Promise((resolve) => {
        entered();
        finish = () => resolve({ status: "NO_MATCH" });
      });
    const first = c.request(staff.token, fields);
    await started;
    logger.mockClear();

    const denied = await c.request(staff.token, fields);
    expect(denied.status).toBe(200);
    expect(await denied.json()).toEqual({ status: "UNAVAILABLE" });
    expect(c.calls).toBe(1);
    expect(boundaryMessages()).toContain(
      "PLATE_OCR_BOUNDARY cost-guard-denied",
    );
    expect(boundaryMessages()).not.toContain(
      "PLATE_OCR_BOUNDARY provider-dispatch",
    );
    finish();
    await first;
  });

  it.each([
    {
      name: "invalid MIME",
      bytes: new Uint8Array([255, 216, 255, 217]),
      type: "image/png",
      diagnostic: "image-mime-invalid",
    },
    {
      name: "oversized image",
      bytes: new Uint8Array(1_048_577),
      type: "image/jpeg",
      diagnostic: "image-size-invalid",
    },
  ])("classifies $name before provider dispatch", async (scenario) => {
    const staff = await c.staff();
    const response = await c.request(
      staff.token,
      { targetLocationId: staff.locationId, plateCountry: "JO" },
      scenario.bytes,
      scenario.type,
    );

    expect(response.status).toBe(400);
    expect(c.calls).toBe(0);
    expect(boundaryMessages()).toContain(
      `PLATE_OCR_BOUNDARY ${scenario.diagnostic}`,
    );
    expect(boundaryMessages()).not.toContain(
      "PLATE_OCR_BOUNDARY provider-dispatch",
    );
  });

  it("emits no boundary diagnostics in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    c.reset("production");
    const staff = await c.staff();
    const response = await c.request(staff.token, {
      targetLocationId: staff.locationId,
      plateCountry: "JO",
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "UNAVAILABLE" });
    expect(c.calls).toBe(0);
    expect(boundaryMessages()).toEqual([]);
  });

  it("never logs identity, plate, token, or image data", async () => {
    const staff = await c.staff();
    const plate = "PLATE-LOG-CANARY";
    c.result = async () => ({
      status: "MATCH",
      candidate: { plateNumberRaw: plate, confidence: 0.9 },
    });
    await c.request(staff.token, {
      targetLocationId: staff.locationId,
      plateCountry: "JO",
    });

    const output = boundaryMessages().join("\n");
    for (const value of [
      staff.token,
      staff.userId,
      staff.membershipId,
      staff.organizationId,
      staff.locationId,
      plate,
      "255,216,255,217",
    ])
      expect(output).not.toContain(value);
  });
});

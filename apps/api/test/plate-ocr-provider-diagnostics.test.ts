import { Logger } from "@nestjs/common";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readPlateOcrConfig } from "../src/modules/check-in-api/plate-ocr-config";
import { PlateRecognizerSnapshotProvider } from "../src/modules/check-in-api/plate-recognizer-snapshot.provider";

const env = {
  PLATE_OCR_ENDPOINT: "http://127.0.0.1:8181/read/",
  PLATE_OCR_TOKEN: "test-only-secret",
};
const input = {
  image: new Uint8Array([255, 216, 255, 217]),
  plateCountry: "JO" as const,
};

function setup(http: typeof fetch) {
  return new PlateRecognizerSnapshotProvider(readPlateOcrConfig(env), http);
}

function messages(logger: ReturnType<typeof vi.spyOn>): string[] {
  return logger.mock.calls.map(([message]: [unknown, ...unknown[]]) =>
    String(message),
  );
}

describe("Plate OCR provider diagnostics", () => {
  beforeEach(() => vi.stubEnv("NODE_ENV", "test"));
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("classifies an HTTP 201 match without logging sensitive data", async () => {
    const logger = vi
      .spyOn(Logger.prototype, "log")
      .mockImplementation(() => {});
    const plate = "DO-NOT-LOG-123";
    const http = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          results: [{ plate, score: 0.91, box: { xmin: 1 } }],
        }),
        { status: 201 },
      ),
    );

    expect(await setup(http).recognize(input)).toEqual({
      status: "MATCH",
      candidate: { plateNumberRaw: plate, confidence: 0.91 },
    });
    expect(messages(logger)).toEqual([
      "PLATE_OCR_PROVIDER request-start",
      "PLATE_OCR_PROVIDER http-success status=201 results=1",
      "PLATE_OCR_PROVIDER match status=201 results=1",
    ]);
    const output = messages(logger).join("\n");
    expect(output).not.toContain(env.PLATE_OCR_TOKEN);
    expect(output).not.toContain(plate);
    expect(output).not.toContain("xmin");
    expect(output).not.toContain(String(input.image));
  });

  it("classifies an HTTP 201 response with no match", async () => {
    const logger = vi
      .spyOn(Logger.prototype, "log")
      .mockImplementation(() => {});
    const http = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('{"results":[]}', { status: 201 }));

    expect(await setup(http).recognize(input)).toEqual({ status: "NO_MATCH" });
    expect(messages(logger)).toEqual([
      "PLATE_OCR_PROVIDER request-start",
      "PLATE_OCR_PROVIDER http-success status=201 results=0",
      "PLATE_OCR_PROVIDER no-match status=201 results=0",
    ]);
  });

  it.each([429, 500])(
    "classifies HTTP %i without reading or logging the body",
    async (status) => {
      const logger = vi
        .spyOn(Logger.prototype, "log")
        .mockImplementation(() => {});
      const http = vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response("secret response", { status }));

      expect(await setup(http).recognize(input)).toEqual({
        status: "UNAVAILABLE",
      });
      expect(messages(logger)).toEqual([
        "PLATE_OCR_PROVIDER request-start",
        `PLATE_OCR_PROVIDER http-non-ok status=${status}`,
      ]);
      expect(messages(logger).join("\n")).not.toContain("secret response");
    },
  );

  it("distinguishes timeout from a generic network failure", async () => {
    vi.useFakeTimers();
    const logger = vi
      .spyOn(Logger.prototype, "log")
      .mockImplementation(() => {});
    const timeoutHttp = vi.fn<typeof fetch>().mockImplementation(
      (_url, options) =>
        new Promise((_resolve, reject) => {
          options?.signal?.addEventListener("abort", () =>
            reject(new Error("private timeout detail")),
          );
        }),
    );
    const timeoutResponse = setup(timeoutHttp).recognize(input);
    await vi.advanceTimersByTimeAsync(4000);
    expect(await timeoutResponse).toEqual({ status: "UNAVAILABLE" });
    expect(messages(logger)).toContain("PLATE_OCR_PROVIDER timeout");

    const networkHttp = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error(`network ${env.PLATE_OCR_TOKEN}`));
    expect(await setup(networkHttp).recognize(input)).toEqual({
      status: "UNAVAILABLE",
    });
    expect(messages(logger)).toContain("PLATE_OCR_PROVIDER network-error");
    expect(messages(logger).join("\n")).not.toContain(env.PLATE_OCR_TOKEN);
    expect(messages(logger).join("\n")).not.toContain("private timeout detail");
  });

  it.each([
    {
      name: "missing body",
      response: { ok: true, status: 201, body: null } as Response,
      diagnostic: "response-body-missing",
    },
    {
      name: "oversized body",
      response: new Response("x".repeat(65_537), { status: 201 }),
      diagnostic: "response-too-large",
    },
    {
      name: "invalid JSON",
      response: new Response("not JSON", { status: 201 }),
      diagnostic: "invalid-json",
    },
  ])("classifies $name", async ({ response, diagnostic }) => {
    const logger = vi
      .spyOn(Logger.prototype, "log")
      .mockImplementation(() => {});
    const http = vi.fn<typeof fetch>().mockResolvedValue(response);

    expect(await setup(http).recognize(input)).toEqual({
      status: "UNAVAILABLE",
    });
    expect(messages(logger)).toContain(
      `PLATE_OCR_PROVIDER ${diagnostic} status=201`,
    );
  });

  it.each([
    {
      payload: { results: [null] },
      diagnostic: "invalid-provider-shape",
    },
    {
      payload: { results: [{ plate: "DO-NOT-LOG", score: 2 }] },
      diagnostic: "candidate-validation-failure",
    },
  ])("classifies $diagnostic", async ({ payload, diagnostic }) => {
    const logger = vi
      .spyOn(Logger.prototype, "log")
      .mockImplementation(() => {});
    const http = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(JSON.stringify(payload), { status: 201 }),
      );

    expect(await setup(http).recognize(input)).toEqual({
      status: "UNAVAILABLE",
    });
    expect(messages(logger)).toContain(
      `PLATE_OCR_PROVIDER ${diagnostic} status=201 results=1`,
    );
    expect(messages(logger).join("\n")).not.toContain("DO-NOT-LOG");
  });

  it("classifies missing configuration before provider I/O", async () => {
    const logger = vi
      .spyOn(Logger.prototype, "log")
      .mockImplementation(() => {});
    const http = vi.fn<typeof fetch>();

    expect(
      await new PlateRecognizerSnapshotProvider(undefined, http).recognize(
        input,
      ),
    ).toEqual({ status: "UNAVAILABLE" });
    expect(http).not.toHaveBeenCalled();
    expect(messages(logger)).toEqual(["PLATE_OCR_PROVIDER config-unavailable"]);
  });

  it("keeps production behavior while emitting no diagnostics", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const logger = vi
      .spyOn(Logger.prototype, "log")
      .mockImplementation(() => {});
    const http = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response('{"results":[{"plate":"AA123","score":0.9}]}', {
          status: 201,
        }),
      )
      .mockResolvedValueOnce(new Response("private", { status: 429 }));
    const provider = setup(http);

    expect(await provider.recognize(input)).toEqual({
      status: "MATCH",
      candidate: { plateNumberRaw: "AA123", confidence: 0.9 },
    });
    expect(await provider.recognize(input)).toEqual({ status: "UNAVAILABLE" });
    expect(logger).not.toHaveBeenCalled();
  });
});

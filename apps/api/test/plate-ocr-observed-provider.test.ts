import { afterEach, describe, expect, it, vi } from "vitest";
import { readPlateOcrConfig } from "../src/modules/check-in-api/plate-ocr-config";
import { PlateRecognizerSnapshotProvider } from "../src/modules/check-in-api/plate-recognizer-snapshot.provider";

const config = readPlateOcrConfig({
  NODE_ENV: "production",
  PLATE_OCR_ENDPOINT: "https://ocr.example.test/read/",
  PLATE_OCR_TOKEN: "fixture-secret",
})!;
const input = {
  image: new Uint8Array([255, 216, 255, 217]),
  plateCountry: "JO" as const,
};
afterEach(() => vi.useRealTimers());

describe("private OCR dispatch and observation", () => {
  it.each(["production", "development", "test"])(
    "never dispatches through the unobserved entrypoint in %s",
    async (mode) => {
      vi.stubEnv("NODE_ENV", mode);
      const http = vi.fn<typeof fetch>();
      try {
        const result = await new PlateRecognizerSnapshotProvider(
          config,
          http,
        ).recognize(input);
        expect(result).toEqual({ status: "UNAVAILABLE" });
        expect(http).not.toHaveBeenCalled();
      } finally {
        vi.unstubAllEnvs();
      }
    },
  );

  it.each(["production", "development", "test"])(
    "rejects missing observed options and permit with zero fetch in %s",
    async (mode) => {
      vi.stubEnv("NODE_ENV", mode);
      const http = vi.fn<typeof fetch>();
      const provider = new PlateRecognizerSnapshotProvider(config, http);
      try {
        for (const options of [
          undefined,
          { signal: new AbortController().signal },
          { signal: new AbortController().signal, permit: {} },
          {
            signal: new AbortController().signal,
            permit: { consumeIfFresh: true },
          },
        ]) {
          const observed = await provider.recognizeObserved(
            input,
            options as never,
          );
          expect(observed).toMatchObject({
            response: { status: "UNAVAILABLE" },
            fetchInvoked: false,
            disposition: "NOT_SENT",
            observationClass: "NOT_INVOKED",
          });
          expect(http).not.toHaveBeenCalled();
        }
      } finally {
        vi.unstubAllEnvs();
      }
    },
  );

  it("rejects a throwing or non-boolean permit before any HTTP", async () => {
    const http = vi.fn<typeof fetch>();
    const provider = new PlateRecognizerSnapshotProvider(config, http);
    for (const consumeIfFresh of [
      () => {
        throw new Error("private permit failure");
      },
      () => "true",
    ]) {
      const result = await provider.recognizeObserved(input, {
        permit: { consumeIfFresh: consumeIfFresh as unknown as () => boolean },
        signal: new AbortController().signal,
      });
      expect(result).toMatchObject({
        response: { status: "UNAVAILABLE" },
        fetchInvoked: false,
        disposition: "NOT_SENT",
      });
      expect(http).not.toHaveBeenCalled();
    }
  });
  it("never invokes HTTP when the sealed permit is stale", async () => {
    const consumeIfFresh = vi.fn(() => false);
    const http = vi.fn<typeof fetch>();
    const observed = await new PlateRecognizerSnapshotProvider(
      config,
      http,
    ).recognizeObserved(input, {
      permit: { consumeIfFresh },
      signal: new AbortController().signal,
    });
    expect(consumeIfFresh).toHaveBeenCalledOnce();
    expect(http).not.toHaveBeenCalled();
    expect(observed).toMatchObject({
      response: { status: "UNAVAILABLE" },
      fetchInvoked: false,
      disposition: "NOT_SENT",
      httpResponseComplete: false,
      observationClass: "NOT_INVOKED",
      failureClass: "NONE",
      httpClass: "NONE",
    });
  });

  it("does not spend permit or invoke fetch when already cancelled", async () => {
    const abort = new AbortController();
    abort.abort();
    const consumeIfFresh = vi.fn(() => true);
    const http = vi.fn<typeof fetch>();
    const result = await new PlateRecognizerSnapshotProvider(
      config,
      http,
    ).recognizeObserved(input, {
      permit: { consumeIfFresh },
      signal: abort.signal,
    });
    expect(consumeIfFresh).not.toHaveBeenCalled();
    expect(http).not.toHaveBeenCalled();
    expect(result.fetchInvoked).toBe(false);
  });

  it("consumes before exactly one fetch, returning only neutral fields", async () => {
    const order: string[] = [];
    const consumeIfFresh = () => {
      order.push("permit");
      return true;
    };
    const http = vi
      .fn<typeof fetch>()
      .mockImplementation(async (_url, options) => {
        order.push("fetch");
        expect((options?.body as FormData).get("regions")).toBe("jo");
        return new Response(
          JSON.stringify({
            results: [{ plate: "AA123", score: 0.9, secret: "ignored" }],
          }),
          { status: 201 },
        );
      });
    const observed = await new PlateRecognizerSnapshotProvider(
      config,
      http,
    ).recognizeObserved(input, {
      permit: { consumeIfFresh },
      signal: new AbortController().signal,
    });
    expect(order).toEqual(["permit", "fetch"]);
    expect(http).toHaveBeenCalledOnce();
    expect(observed).toMatchObject({
      response: {
        status: "MATCH",
        candidate: { plateNumberRaw: "AA123", confidence: 0.9 },
      },
      fetchInvoked: true,
      disposition: "UNKNOWN",
      httpResponseComplete: true,
      observationClass: "HTTP_COMPLETE",
      httpClass: "2XX",
      failureClass: "NONE",
    });
    expect(JSON.stringify(observed)).not.toContain("ignored");
    expect(JSON.stringify(observed)).not.toContain("fixture-secret");
  });

  it("marks an invoked cancellation remote-uncertain without retry", async () => {
    const abort = new AbortController();
    const http = vi.fn<typeof fetch>().mockImplementation(
      (_url, options) =>
        new Promise((_resolve, reject) => {
          options?.signal?.addEventListener(
            "abort",
            () => {
              reject(new Error("private details"));
            },
            { once: true },
          );
        }),
    );
    const pending = new PlateRecognizerSnapshotProvider(
      config,
      http,
    ).recognizeObserved(input, {
      permit: { consumeIfFresh: () => true },
      signal: abort.signal,
    });
    abort.abort();
    expect(await pending).toMatchObject({
      response: { status: "UNAVAILABLE" },
      fetchInvoked: true,
      disposition: "UNKNOWN",
      httpResponseComplete: false,
      observationClass: "UNCERTAIN",
      failureClass: "CANCELLED",
    });
    expect(http).toHaveBeenCalledOnce();
  });

  it("returns by deadline even if the remote fetch ignores AbortSignal", async () => {
    vi.useFakeTimers();
    const http = vi
      .fn<typeof fetch>()
      .mockImplementation(() => new Promise(() => {}));
    const pending = new PlateRecognizerSnapshotProvider(
      config,
      http,
    ).recognizeObserved(input, {
      permit: { consumeIfFresh: () => true },
      signal: new AbortController().signal,
    });
    await vi.advanceTimersByTimeAsync(4000);
    expect(await pending).toMatchObject({
      response: { status: "UNAVAILABLE" },
      fetchInvoked: true,
      observationClass: "UNCERTAIN",
      failureClass: "TIMEOUT",
    });
    expect(http).toHaveBeenCalledOnce();
  });

  it("bounds a successful HTTP status followed by a noncooperative body stream", async () => {
    vi.useFakeTimers();
    const http = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(new ReadableStream({ start: () => undefined }), {
        status: 201,
      }),
    );
    const pending = new PlateRecognizerSnapshotProvider(
      config,
      http,
    ).recognizeObserved(input, {
      permit: { consumeIfFresh: () => true },
      signal: new AbortController().signal,
    });
    await vi.advanceTimersByTimeAsync(4000);
    expect(await pending).toMatchObject({
      response: { status: "UNAVAILABLE" },
      fetchInvoked: true,
      disposition: "UNKNOWN",
      observationClass: "UNCERTAIN",
      httpClass: "NONE",
      failureClass: "TIMEOUT",
    });
    expect(http).toHaveBeenCalledOnce();
  });

  it("classifies HTTP 429 without recording the response body", async () => {
    const http = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("secret body", { status: 429 }));
    const observed = await new PlateRecognizerSnapshotProvider(
      config,
      http,
    ).recognizeObserved(input, {
      permit: { consumeIfFresh: () => true },
      signal: new AbortController().signal,
    });
    expect(observed).toMatchObject({
      response: { status: "UNAVAILABLE" },
      fetchInvoked: true,
      disposition: "UNKNOWN",
      observationClass: "UNCERTAIN",
      httpClass: "NONE",
      failureClass: "PROVIDER",
      httpResponseComplete: false,
    });
    expect(JSON.stringify(observed)).not.toContain("secret body");
  });
});

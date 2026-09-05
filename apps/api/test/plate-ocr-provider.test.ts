import { afterEach, describe, expect, it, vi } from "vitest";
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
function setup(payload: unknown) {
  const http = vi
    .fn<typeof fetch>()
    .mockResolvedValue(new Response(JSON.stringify(payload)));
  const provider = new PlateRecognizerSnapshotProvider(
    readPlateOcrConfig(env),
    http,
  );
  return { provider, http };
}
afterEach(() => vi.useRealTimers());
describe("Snapshot-compatible adapter", () => {
  it.each([
    ["JO", "jo"],
    ["AE", "ae"],
    ["SA", "sa"],
    ["KW", "kw"],
    ["BH", "bh"],
    ["OTHER", null],
  ] as const)(
    "maps %s, uses configured endpoint and server-only token",
    async (plateCountry, hint) => {
      const c = setup({ results: [] });
      expect(await c.provider.recognize({ ...input, plateCountry })).toEqual({
        status: "NO_MATCH",
      });
      const [url, options] = c.http.mock.calls[0]!;
      expect(url).toBe(env.PLATE_OCR_ENDPOINT);
      expect(options?.headers).toEqual({
        Authorization: `Token ${env.PLATE_OCR_TOKEN}`,
      });
      expect(options?.redirect).toBe("error");
      const form = options?.body as FormData;
      expect(form.get("regions")).toBe(hint);
      expect((form.get("upload") as Blob).type).toBe("image/jpeg");
    },
  );
  it("selects deterministically and strips all unrelated provider fields", async () => {
    const c = setup({
      usage: { calls: 1 },
      results: [
        {
          plate: "ZZ123",
          score: 0.9,
          vehicle: { make: "ignored" },
          region: { code: "sa" },
          box: {},
        },
        { plate: "AA123", score: 0.9, color: "ignored" },
        { plate: "LOW", score: 0.7 },
      ],
    });
    expect(await c.provider.recognize(input)).toEqual({
      status: "MATCH",
      candidate: { plateNumberRaw: "AA123", confidence: 0.9 },
    });
  });
  it.each([{ results: [] }, { results: [{ plate: "LOW", score: 0.79 }] }])(
    "returns no match %j",
    async (payload) => {
      expect(await setup(payload).provider.recognize(input)).toEqual({
        status: "NO_MATCH",
      });
    },
  );
  it.each([
    {},
    { results: null },
    { results: [{ plate: "bad", score: 2 }] },
    { results: [{ score: 0.9 }] },
  ])("fails safely on malformed response %j", async (payload) => {
    expect(await setup(payload).provider.recognize(input)).toEqual({
      status: "UNAVAILABLE",
    });
  });
  it("does not call HTTP with missing or malformed configuration", async () => {
    for (const values of [
      {},
      { ...env, PLATE_OCR_MIN_SCORE: "oops" },
      { ...env, PLATE_OCR_MIN_SCORE: "" },
      { ...env, PLATE_OCR_TIMEOUT_MS: "Infinity" },
      { ...env, PLATE_OCR_ENDPOINT: "file:///secret" },
      { ...env, PLATE_OCR_TOKEN: "bad\nsecret" },
    ]) {
      const http = vi.fn<typeof fetch>();
      expect(
        await new PlateRecognizerSnapshotProvider(
          readPlateOcrConfig(values),
          http,
        ).recognize(input),
      ).toEqual({ status: "UNAVAILABLE" });
      expect(http).not.toHaveBeenCalled();
    }
  });
  it("handles network/HTTP/parse/oversize response failures without exposing secrets", async () => {
    const c = setup({});
    c.http.mockRejectedValueOnce(new Error(env.PLATE_OCR_TOKEN));
    c.http.mockResolvedValueOnce(new Response("error", { status: 429 }));
    c.http.mockResolvedValueOnce(new Response("not JSON"));
    c.http.mockResolvedValueOnce(new Response("x".repeat(65537)));
    for (let i = 0; i < 4; i++)
      expect(await c.provider.recognize(input)).toEqual({
        status: "UNAVAILABLE",
      });
  });
  it("aborts on bounded timeout without retrying", async () => {
    vi.useFakeTimers();
    const http = vi.fn<typeof fetch>().mockImplementation(
      (_url, options) =>
        new Promise((_resolve, reject) => {
          options?.signal?.addEventListener("abort", () =>
            reject(new Error("timeout")),
          );
        }),
    );
    const promise = new PlateRecognizerSnapshotProvider(
      readPlateOcrConfig(env),
      http,
    ).recognize(input);
    await vi.advanceTimersByTimeAsync(4000);
    expect(await promise).toEqual({ status: "UNAVAILABLE" });
    expect(http).toHaveBeenCalledOnce();
  });
});
